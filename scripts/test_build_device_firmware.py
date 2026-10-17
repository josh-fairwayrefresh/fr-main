import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_device_firmware import (  # noqa: E402
    BOARD,
    APPLICATION_CONFIGURATION,
    ACCEPTED_FIRMWARE_SOURCE,
    _protect_tree,
    _validate_output_path,
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
        self.manifest_path = self.root / "fairway-FRB-9001-manifest.json"
        self.write_artifact()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_artifact(self, device_id="FRB-9001", credential=SYNTHETIC_CREDENTIAL):
        content = f"firmware:{device_id}:credential:{credential}".encode("ascii")
        write_intel_hex(self.artifact, content)
        if os.name != "nt":
            self.artifact.chmod(0o600)
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
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        if os.name != "nt":
            self.manifest_path.chmod(0o600)

    def test_verifies_device_identity_credential_and_artifact_integrity(self):
        manifest = verify_artifact(
            self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
        )
        self.assertEqual(manifest["device_id"], "FRB-9001")
        self.assertTrue(manifest["credential_embedded"])

    def test_manifest_contains_reproducible_nonsecret_build_configuration(self):
        manifest = verify_artifact(
            self.artifact, self.manifest_path, "FRB-9001", self.secrets_dir
        )
        self.assertEqual(manifest["board"], BOARD)
        self.assertEqual(manifest["application_configuration"], "prj_a.conf")
        self.assertIn("--pristine=always", manifest["build_command"])
        self.assertIn("-DBOARD_ROOT=", " ".join(manifest["build_command"]))

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
