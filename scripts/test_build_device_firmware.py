import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_device_firmware import (  # noqa: E402
    BOARD,
    APPLICATION_CONFIGURATION,
    ACCEPTED_FIRMWARE_SOURCE,
    _protect_tree,
    _generated_boot_configuration,
    _generated_partition_device_tree,
    _generated_partition_layout,
    _validate_output_path,
    _resolve_signing_key,
    _verify_mcuboot_signature,
    resolve_device_input,
    verify_artifact,
)


SYNTHETIC_CREDENTIAL = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
REPOSITORY = Path(__file__).resolve().parents[1]
SECRETS_RELATIVE = Path("samples/fairway_power_sandbox/src/secrets")


def intel_hex_record(address, record_type, data=b""):
    payload = bytes((len(data), (address >> 8) & 0xFF, address & 0xFF, record_type)) + data
    checksum = (-sum(payload)) & 0xFF
    return f":{(payload + bytes((checksum,))).hex().upper()}"


def write_intel_hex(path, contents):
    lines = []
    for offset in range(0, len(contents), 16):
        lines.append(intel_hex_record(offset, 0, contents[offset : offset + 16]))
    lines.append(intel_hex_record(0, 1))
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


class DeviceInputTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.secrets_dir = self.root / "secrets"
        self.secrets_dir.mkdir(mode=0o700)
        if os.name != "nt":
            self.secrets_dir.chmod(0o700)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_header(self, device_id="FRB-9001", credential=SYNTHETIC_CREDENTIAL):
        path = self.secrets_dir / f"{device_id}-fairway_device_key.h"
        path.write_text(
            f'#define FAIRWAY_DEVICE_ID "{device_id}"\n'
            f'#define FAIRWAY_DEVICE_KEY "{credential}"\n',
            encoding="utf-8",
        )
        if os.name != "nt":
            path.chmod(0o600)
        return path

    def test_selects_named_input_for_arbitrary_device(self):
        expected = self.write_header()
        self.assertEqual(
            resolve_device_input("FRB-9001", self.secrets_dir), expected.resolve()
        )

    def test_rejects_invalid_or_missing_target_device_id(self):
        self.write_header()
        for device_id in ("", "FRB-1", "FRB-00001", "../FRB-9001"):
            with self.subTest(invalid_target=True):
                with self.assertRaisesRegex(ValueError, "Device ID"):
                    resolve_device_input(device_id, self.secrets_dir)

    def test_rejects_missing_input_without_generic_fallback(self):
        generic = self.secrets_dir / "fairway_device_key.h"
        generic.write_text(
            '#define FAIRWAY_DEVICE_ID "FRB-9001"\n'
            f'#define FAIRWAY_DEVICE_KEY "{SYNTHETIC_CREDENTIAL}"\n',
            encoding="utf-8",
        )
        if os.name != "nt":
            generic.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "unavailable"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_explicit_generic_input_is_identity_checked(self):
        generic = self.secrets_dir / "fairway_device_key.h"
        generic.write_text(
            '#define FAIRWAY_DEVICE_ID "FRB-9001"\n'
            f'#define FAIRWAY_DEVICE_KEY "{SYNTHETIC_CREDENTIAL}"\n',
            encoding="utf-8",
        )
        if os.name != "nt":
            generic.chmod(0o600)
        self.assertEqual(
            resolve_device_input("FRB-9001", self.secrets_dir, generic),
            generic.resolve(),
        )
        self.write_header()
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            resolve_device_input("FRB-9001", self.secrets_dir, generic)

    def test_rejects_missing_identity_definition(self):
        path = self.write_header()
        path.write_text(f'#define FAIRWAY_DEVICE_KEY "{SYNTHETIC_CREDENTIAL}"\n', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "exactly one Device ID"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_missing_credential_definition(self):
        path = self.write_header()
        path.write_text('#define FAIRWAY_DEVICE_ID "FRB-9001"\n', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "exactly one credential"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_placeholder_credential(self):
        self.write_header(credential="replace-with-device-credential")
        with self.assertRaisesRegex(ValueError, "placeholder"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_malformed_credential(self):
        self.write_header(credential="not-a-valid-device-credential")
        with self.assertRaisesRegex(ValueError, "invalid format"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_noncanonical_base64url_credential(self):
        self.write_header(credential="A" * 42 + "B")
        with self.assertRaisesRegex(ValueError, "invalid format"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_duplicate_identity_definitions(self):
        path = self.write_header()
        with path.open("a", encoding="utf-8") as stream:
            stream.write('#define FAIRWAY_DEVICE_ID "FRB-9001"\n')
        with self.assertRaisesRegex(ValueError, "exactly one Device ID"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_duplicate_credential_definitions(self):
        path = self.write_header()
        with path.open("a", encoding="utf-8") as stream:
            stream.write(f'#define FAIRWAY_DEVICE_KEY "{SYNTHETIC_CREDENTIAL}"\n')
        with self.assertRaisesRegex(ValueError, "exactly one credential"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_device_id_mismatch(self):
        path = self.write_header()
        path.write_text(
            '#define FAIRWAY_DEVICE_ID "FRB-9002"\n'
            f'#define FAIRWAY_DEVICE_KEY "{SYNTHETIC_CREDENTIAL}"\n',
            encoding="utf-8",
        )
        with self.assertRaisesRegex(ValueError, "does not match"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_symlink_input(self):
        target = self.write_header("FRB-9002")
        (self.secrets_dir / "FRB-9001-fairway_device_key.h").symlink_to(target)
        with self.assertRaisesRegex(ValueError, "symlink"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_rejects_symlink_secrets_directory(self):
        link = self.root / "secrets-link"
        link.symlink_to(self.secrets_dir, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "non-symlink"):
            resolve_device_input("FRB-9001", link)

    @unittest.skipIf(os.name == "nt", "POSIX file permissions are not available")
    def test_rejects_insecure_input_permissions(self):
        path = self.write_header()
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "permissions"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    @unittest.skipIf(os.name == "nt", "POSIX directory permissions are not available")
    def test_rejects_group_or_world_writable_secrets_directory(self):
        self.write_header()
        self.secrets_dir.chmod(0o777)
        with self.assertRaisesRegex(ValueError, "writable"):
            resolve_device_input("FRB-9001", self.secrets_dir)

    def test_gitignore_covers_current_and_future_headers_but_not_template(self):
        paths = [
            f"{SECRETS_RELATIVE}/FRB-0001-fairway_device_key.h",
            f"{SECRETS_RELATIVE}/FRB-9001-fairway_device_key.h",
        ]
        for path in paths:
            result = subprocess.run(
                ["git", "-C", str(REPOSITORY), "check-ignore", "-q", "--no-index", "--", path],
                check=False,
            )
            self.assertEqual(result.returncode, 0)
        example_path = f"{SECRETS_RELATIVE}/fairway_device_key.example.h"
        result = subprocess.run(
            ["git", "-C", str(REPOSITORY), "check-ignore", "-q", "--no-index", "--", example_path],
            check=False,
        )
        self.assertEqual(result.returncode, 1)

    def test_no_real_device_credential_header_is_tracked(self):
        tracked = subprocess.check_output(
            [
                "git",
                "-C",
                str(REPOSITORY),
                "ls-files",
                "--",
                f"{SECRETS_RELATIVE}/*-fairway_device_key.h",
            ],
            text=True,
        )
        self.assertEqual(tracked.strip(), "")

    def test_protected_tree_removes_group_and_other_permissions(self):
        protected = self.root / "protected"
        protected.mkdir(mode=0o777)
        child = protected / "artifact.hex"
        child.write_bytes(b"synthetic")
        if os.name != "nt":
            protected.chmod(0o777)
            child.chmod(0o644)
        _protect_tree(protected)
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(protected.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(child.stat().st_mode) & 0o077, 0)


class BuildEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.build_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_reads_generated_mcuboot_slot_boundaries(self):
        report = self.build_dir / "partitions.yml"
        report.write_text(
            "mcuboot_primary:\n"
            "  address: 0x10000\n"
            "  size: 0x78000\n"
            "mcuboot_secondary:\n"
            "  address: 0x88000\n"
            "  end_address: 0x100000\n"
            "  size: 0x78000\n",
            encoding="utf-8",
        )
        self.assertEqual(
            _generated_partition_layout(self.build_dir),
            {
                "mcuboot_primary": {"address": 0x10000, "size": 0x78000},
                "mcuboot_secondary": {
                    "address": 0x88000,
                    "end_address": 0x100000,
                    "size": 0x78000,
                },
            },
        )

    def test_rejects_missing_or_ambiguous_partition_report(self):
        with self.assertRaisesRegex(ValueError, "found 0"):
            _generated_partition_layout(self.build_dir)

        report = self.build_dir / "partitions.yml"
        report.write_text(
            "mcuboot_primary:\n  address: 0x10000\n  size: 0x1000\n"
            "mcuboot_secondary:\n  address: 0x11000\n  size: 0x1000\n",
            encoding="utf-8",
        )
        (self.build_dir / "child").mkdir()
        (self.build_dir / "child" / "partitions.yml").write_text(
            report.read_text(encoding="utf-8"), encoding="utf-8"
        )
        with self.assertRaisesRegex(ValueError, "found 2"):
            _generated_partition_layout(self.build_dir)

    def test_extracts_only_boot_and_signing_configuration(self):
        config = self.build_dir / "mcuboot" / "zephyr"
        config.mkdir(parents=True)
        (config / ".config").write_text(
            'CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256=y\n'
            'CONFIG_BOOT_SIGNATURE_KEY_FILE="root-ec-p256.pem"\n'
            'CONFIG_BOOT_SWAP_USING_MOVE=y\n'
            'CONFIG_FAIRWAY_DEVICE_KEY="must-not-be-captured"\n',
            encoding="utf-8",
        )
        app_config = self.build_dir / "fairway_power_sandbox" / "zephyr"
        app_config.mkdir(parents=True)
        (app_config / ".config").write_text(
            'CONFIG_MCUBOOT_SIGNATURE_KEY_FILE="root-ec-p256.pem"\n'
            'CONFIG_FAIRWAY_DEVICE_KEY="must-not-be-captured"\n',
            encoding="utf-8",
        )
        evidence = _generated_boot_configuration(self.build_dir)
        self.assertEqual(
            evidence["mcuboot/zephyr"],
            {
                "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256": "y",
                "CONFIG_BOOT_SIGNATURE_KEY_FILE": "root-ec-p256.pem",
                "CONFIG_BOOT_SWAP_USING_MOVE": "y",
            },
        )
        self.assertEqual(
            evidence["fairway_power_sandbox/zephyr"],
            {"CONFIG_MCUBOOT_SIGNATURE_KEY_FILE": "root-ec-p256.pem"},
        )

    def test_extracts_partition_nodes_from_generated_application_devicetree(self):
        dts = self.build_dir / "fairway_power_sandbox" / "zephyr"
        dts.mkdir(parents=True)
        path = dts / "zephyr.dts"
        path.write_text(
            "/ {\n"
            "\tflash@0 {\n"
            "\t\tpartitions {\n"
            "\t\t\tpartition@85000 {\n"
            '\t\t\t\tlabel = "image-1";\n'
            "\t\t\t\treg = <0x85000 0x40000>;\n"
            "\t\t\t};\n"
            "\t\t};\n"
            "\t};\n"
            "};\n",
            encoding="utf-8",
        )
        evidence = _generated_partition_device_tree(self.build_dir)
        self.assertIn('label = "image-1";', evidence["partitions"][0])
        self.assertIn("reg = <0x85000 0x40000>;", evidence["partitions"][0])


class ArtifactVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.secrets_dir = self.root / "secrets"
        self.secrets_dir.mkdir(mode=0o700)
        if os.name != "nt":
            self.secrets_dir.chmod(0o700)
        self.header = self.secrets_dir / "FRB-9001-fairway_device_key.h"
        self.header.write_text(
            '#define FAIRWAY_DEVICE_ID "FRB-9001"\n'
            f'#define FAIRWAY_DEVICE_KEY "{SYNTHETIC_CREDENTIAL}"\n',
            encoding="utf-8",
        )
        if os.name != "nt":
            self.header.chmod(0o600)
        self.artifact = self.root / "fairway-FRB-9001-merged.hex"
        self.ota_artifact = self.root / "fairway-FRB-9001-ota.signed.bin"
        self.manifest_path = self.root / "fairway-FRB-9001-manifest.json"
        self.ncs_dir = self.root / "ncs"
        (self.ncs_dir / "nrf").mkdir(parents=True)
        (self.ncs_dir / "nrf" / "VERSION").write_text("3.1.1\n", encoding="utf-8")
        self.imgtool = self.ncs_dir / "bootloader" / "mcuboot" / "scripts" / "imgtool.py"
        self.imgtool.parent.mkdir(parents=True)
        self.imgtool.write_text("# test imgtool placeholder\n", encoding="utf-8")
        self.signing_key = self.root / "signing-key.pem"
        self.signing_key.write_text("test signing key fixture\n", encoding="ascii")
        self.west_topdir = self.root / "west"
        self.west_topdir.mkdir()
        self.write_artifact()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_artifact(
        self,
        device_id="FRB-9001",
        credential=SYNTHETIC_CREDENTIAL,
        include_ota=False,
        signing_configuration=None,
    ):
        content = f"firmware:{device_id}:credential:{credential}".encode("ascii")
        write_intel_hex(self.artifact, content)
        if os.name != "nt":
            self.artifact.chmod(0o600)
        ota_content = (
            bytes((0x3D, 0xB8, 0xF3, 0x96))
            + f"firmware:{device_id}:credential:{credential}".encode("ascii")
        )
        self.ota_artifact.write_bytes(ota_content)
        if os.name != "nt":
            self.ota_artifact.chmod(0o600)
        manifest = {
            "device_id": "FRB-9001",
            "provisioning_input_file": self.header.name,
            "accepted_firmware_source": ACCEPTED_FIRMWARE_SOURCE,
            "source_commit": "a" * 40,
            "source_branch": "main",
            "source_worktree_dirty": False,
            "build_source_sha256": "b" * 64,
            "ncs_version": "3.1.1",
            "toolchain_bundle": "toolchain-test",
            "west_version": "west test",
            "board": BOARD,
            "application_configuration": APPLICATION_CONFIGURATION,
            "build_command": [
                "west",
                "build",
                "--pristine=always",
                "-DBOARD_ROOT=/workspace/nfed",
                "-DDEBUG_THREAD_INFO=On",
                "-DCONFIG_DEBUG_THREAD_INFO=y",
                "-Dfairway_power_sandbox_DEBUG_THREAD_INFO=On",
                "-Dmcuboot_DEBUG_THREAD_INFO=Off",
            ],
            "credential_embedded": True,
            "artifact_file": self.artifact.name,
            "size_bytes": self.artifact.stat().st_size,
            "sha256": hashlib.sha256(self.artifact.read_bytes()).hexdigest(),
        }
        if include_ota:
            manifest.update({
                "ota_artifact_file": self.ota_artifact.name,
                "ota_size_bytes": self.ota_artifact.stat().st_size,
                "ota_sha256": hashlib.sha256(self.ota_artifact.read_bytes()).hexdigest(),
                "generated_boot_configuration": signing_configuration if signing_configuration is not None else {
                    "mcuboot/zephyr": {
                        "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256": "y",
                        "CONFIG_BOOT_SIGNATURE_KEY_FILE": str(self.signing_key),
                    },
                    "fairway_power_sandbox/zephyr": {
                        "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE": str(self.signing_key),
                    },
                },
            })
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        if os.name != "nt":
            self.manifest_path.chmod(0o600)

    def verify_with_ota(self):
        return verify_artifact(
            self.artifact,
            self.manifest_path,
            "FRB-9001",
            self.secrets_dir,
            ota_artifact=self.ota_artifact,
            ncs_install_dir=self.ncs_dir,
            west_topdir=self.west_topdir,
        )

    def test_verifies_device_identity_credential_and_artifact_integrity(self):
        manifest = verify_artifact(
            self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
        )
        self.assertEqual(manifest["device_id"], "FRB-9001")
        self.assertTrue(manifest["credential_embedded"])

    def test_manifest_contains_reproducible_nonsecret_build_configuration(self):
        self.write_artifact(include_ota=True)
        with mock.patch(
            "build_device_firmware.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, "Image was correctly validated", ""),
        ):
            manifest = self.verify_with_ota()
        self.assertEqual(manifest["board"], BOARD)
        self.assertEqual(manifest["application_configuration"], "prj_a.conf")
        self.assertIn("--pristine=always", manifest["build_command"])
        self.assertIn("-DBOARD_ROOT=", " ".join(manifest["build_command"]))
        self.assertEqual(manifest["ota_artifact_file"], self.ota_artifact.name)

    def test_rejects_artifact_manifest_for_different_device(self):
        with self.assertRaisesRegex(ValueError, "different Device"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9002", self.secrets_dir
            )

    def test_rejects_artifact_with_wrong_embedded_identity(self):
        self.write_artifact(device_id="FRB-9002")
        with self.assertRaisesRegex(ValueError, "does not contain"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
            )

    def test_rejects_artifact_with_wrong_embedded_credential(self):
        self.write_artifact(credential="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
        with self.assertRaisesRegex(ValueError, "does not contain"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
            )

    def test_rejects_artifact_hash_mismatch(self):
        self.artifact.write_text(":00000001FF\n", encoding="ascii")
        with self.assertRaisesRegex(ValueError, "size|SHA-256"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
            )

    def test_rejects_ota_image_hash_mismatch(self):
        self.write_artifact(include_ota=True)
        self.ota_artifact.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "OTA image size|OTA image SHA-256"):
            self.verify_with_ota()

    def test_rejects_ota_image_without_mcuboot_header(self):
        self.write_artifact(include_ota=True)
        self.ota_artifact.write_bytes(b"invalid image")
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest["ota_size_bytes"] = self.ota_artifact.stat().st_size
        manifest["ota_sha256"] = hashlib.sha256(self.ota_artifact.read_bytes()).hexdigest()
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "MCUboot image header"):
            self.verify_with_ota()

    def test_requires_manifest_referenced_ota_image(self):
        self.write_artifact(include_ota=True)
        self.ota_artifact.unlink()
        with self.assertRaisesRegex(ValueError, "regular file"):
            self.verify_with_ota()

    def test_ota_verification_uses_configured_key_on_final_output(self):
        self.write_artifact(include_ota=True)
        completed = subprocess.CompletedProcess([], 0, "Image was correctly validated", "")
        with mock.patch("build_device_firmware.subprocess.run", return_value=completed) as run:
            self.verify_with_ota()
        command = run.call_args.args[0]
        self.assertEqual(command[1], str(self.imgtool.resolve()))
        self.assertEqual(
            command[2:5], ["verify", "--key", str(self.signing_key.resolve())]
        )
        self.assertEqual(command[-1], str(self.ota_artifact))

    def test_resolves_relative_key_using_sdk_application_and_west_paths(self):
        app_config_dir = self.root / "application"
        app_config_dir.mkdir()
        app_key = app_config_dir / "release.pem"
        app_key.write_text("application key\n", encoding="ascii")
        west_key = self.west_topdir / "release.pem"
        west_key.write_text("west key\n", encoding="ascii")

        self.assertEqual(
            _resolve_signing_key("release.pem", app_config_dir, self.west_topdir),
            app_key.resolve(),
        )
        app_key.unlink()
        self.assertEqual(
            _resolve_signing_key("release.pem", app_config_dir, self.west_topdir),
            west_key.resolve(),
        )

    def test_explicit_ota_input_requires_ota_manifest_metadata(self):
        with self.assertRaisesRegex(ValueError, "OTA image metadata is required"):
            verify_artifact(
                self.artifact,
                self.manifest_path,
                "FRB-9001",
                self.secrets_dir,
                ota_artifact=self.ota_artifact,
                ncs_install_dir=self.ncs_dir,
            )

    def test_rejects_ota_without_generated_signing_configuration(self):
        self.write_artifact(include_ota=True, signing_configuration={})
        with self.assertRaisesRegex(ValueError, "signing configurations are required"):
            self.verify_with_ota()

    def test_rejects_conflicting_generated_signing_keys(self):
        other_key = self.root / "other-signing-key.pem"
        other_key.write_text("other test signing key\n", encoding="ascii")
        self.write_artifact(
            include_ota=True,
            signing_configuration={
                "mcuboot/zephyr": {
                    "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256": "y",
                    "CONFIG_BOOT_SIGNATURE_KEY_FILE": str(other_key),
                },
                "fairway_power_sandbox/zephyr": {
                    "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE": str(self.signing_key),
                },
            },
        )
        with self.assertRaisesRegex(ValueError, "signing keys do not match"):
            self.verify_with_ota()

    def test_rejects_missing_configured_signing_key(self):
        self.write_artifact(
            include_ota=True,
            signing_configuration={
                "mcuboot/zephyr": {
                    "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256": "y",
                    "CONFIG_BOOT_SIGNATURE_KEY_FILE": str(self.root / "missing-key.pem"),
                },
                "fairway_power_sandbox/zephyr": {
                    "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE": str(self.root / "missing-key.pem"),
                },
            },
        )
        with self.assertRaisesRegex(ValueError, "signing key is missing"):
            self.verify_with_ota()

    def test_rejects_failed_keyed_imgtool_verification(self):
        self.write_artifact(include_ota=True)
        failed = subprocess.CompletedProcess(
            [], 1, "", "No signature found for the given key"
        )
        with mock.patch("build_device_firmware.subprocess.run", return_value=failed):
            with self.assertRaisesRegex(ValueError, "No signature found for the given key"):
                self.verify_with_ota()

    def test_reports_imgtool_execution_failure(self):
        self.write_artifact(include_ota=True)
        with mock.patch(
            "build_device_firmware.subprocess.run",
            side_effect=FileNotFoundError("python interpreter unavailable"),
        ):
            with self.assertRaisesRegex(ValueError, "could not execute NCS imgtool"):
                self.verify_with_ota()

    def test_non_ota_verification_does_not_require_ncs_or_signing_inputs(self):
        manifest = verify_artifact(
            self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
        )
        self.assertEqual(manifest["device_id"], "FRB-9001")

    def test_rejects_malformed_firmware_artifact(self):
        self.artifact.write_text(":00000001FE\n", encoding="ascii")
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest["size_bytes"] = self.artifact.stat().st_size
        manifest["sha256"] = hashlib.sha256(self.artifact.read_bytes()).hexdigest()
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "checksum"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
            )

    def test_rejects_incompatible_build_configuration(self):
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest["application_configuration"] = "prj_b.conf"
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "configuration"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
            )

    def test_manifest_does_not_contain_credential_material_or_credential_hash(self):
        contents = self.manifest_path.read_text(encoding="utf-8")
        self.assertNotIn(SYNTHETIC_CREDENTIAL, contents)
        self.assertNotIn("credential_sha256", contents)

    def test_refuses_existing_output_path_and_checkout_paths(self):
        repo_dir = REPOSITORY.resolve()
        with self.assertRaisesRegex(ValueError, "must not exist"):
            _validate_output_path(self.root, repo_dir, self.secrets_dir.resolve())
        with self.assertRaisesRegex(ValueError, "outside the source checkout"):
            _validate_output_path(
                repo_dir / "new-artifact-output", repo_dir, self.secrets_dir.resolve()
            )
        with self.assertRaisesRegex(ValueError, "outside the provisioning"):
            _validate_output_path(
                self.secrets_dir / "new-artifact-output",
                repo_dir,
                self.secrets_dir.resolve(),
            )

    @unittest.skipIf(os.name == "nt", "POSIX file permissions are not available")
    def test_artifact_verifier_rejects_unprotected_outputs(self):
        self.artifact.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "firmware artifact permissions"):
            verify_artifact(
                self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
            )


@unittest.skipUnless(os.environ.get("NCS_INSTALL_DIR"), "NCS_INSTALL_DIR is not set")
class NordicImgtoolSignatureTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.imgtool = (
            Path(os.environ["NCS_INSTALL_DIR"])
            / "bootloader"
            / "mcuboot"
            / "scripts"
            / "imgtool.py"
        )
        self.key = self.root / "signing-key.pem"
        self.other_key = self.root / "other-signing-key.pem"
        self.payload = self.root / "payload.bin"
        self.image = self.root / "ota.signed.bin"
        self.unsigned_image = self.root / "ota.unsigned.bin"
        self.payload.write_bytes(bytes(range(256)) * 4)
        for key in (self.key, self.other_key):
            subprocess.run(
                [
                    sys.executable,
                    str(self.imgtool),
                    "keygen",
                    "--key",
                    str(key),
                    "--type",
                    "ecdsa-p256",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            [
                sys.executable,
                str(self.imgtool),
                "sign",
                "--version",
                "1.0.0",
                "--header-size",
                "0x200",
                "--slot-size",
                "0x10000",
                "--align",
                "4",
                "--pad-header",
                str(self.payload),
                str(self.unsigned_image),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            [
                sys.executable,
                str(self.imgtool),
                "sign",
                "--key",
                str(self.key),
                "--version",
                "1.0.0",
                "--header-size",
                "0x200",
                "--slot-size",
                "0x10000",
                "--align",
                "4",
                "--pad-header",
                str(self.payload),
                str(self.image),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_ncs_imgtool_accepts_matching_signature_and_rejects_corruption_or_wrong_key(self):
        _verify_mcuboot_signature(self.image, self.key, self.imgtool)

        original_image = self.image.read_bytes()
        with self.image.open("r+b") as image_file:
            image_file.seek(0x200)
            original_byte = image_file.read(1)
            image_file.seek(0x200)
            image_file.write(bytes((original_byte[0] ^ 0x01,)))
        with self.assertRaisesRegex(ValueError, "signature verification failed"):
            _verify_mcuboot_signature(self.image, self.key, self.imgtool)

        self.image.write_bytes(original_image)
        with self.assertRaisesRegex(ValueError, "signature verification failed"):
            _verify_mcuboot_signature(self.image, self.other_key, self.imgtool)

        with self.assertRaisesRegex(ValueError, "signature verification failed"):
            _verify_mcuboot_signature(self.unsigned_image, self.key, self.imgtool)


if __name__ == "__main__":
    unittest.main(verbosity=2)
