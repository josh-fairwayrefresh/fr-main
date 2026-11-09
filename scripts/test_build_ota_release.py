import hashlib
import json
import os
from pathlib import Path
import signal
import struct
import sys
import tempfile
import unittest
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_ota_release  # noqa: E402
import verify_ota_release  # noqa: E402
from build_ota_release import (  # noqa: E402
    HARDWARE_ID,
    RELEASES,
    _generated_boot_public_key_fingerprint,
    _temporarily_unlocked_signing_key,
)


def write_artifact(path: Path, contents: bytes) -> str:
    path.write_bytes(contents)
    return hashlib.sha256(contents).hexdigest()


class OtaReleaseVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)
        self.root = self.work_dir / "release"
        self.root.mkdir()
        self.signing_key = self.work_dir / "fairway-test-signing.pem"
        self.signing_key.write_bytes(b"temporary test private key")
        self.signing_key.chmod(0o600)
        self.fingerprint = f"sha256:{'a' * 64}"
        self.ncs_dir = self.root / "ncs"
        (self.ncs_dir / "nrf").mkdir(parents=True)
        (self.ncs_dir / "nrf" / "VERSION").write_text("3.1.1\n", encoding="ascii")
        imgtool = self.ncs_dir / "bootloader" / "mcuboot" / "scripts" / "imgtool.py"
        imgtool.parent.mkdir(parents=True)
        imgtool.write_text("", encoding="ascii")
        (self.root / "release.conf").write_text(
            'CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION="0.1.0+2"\n'
            'CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION="0.1.0+2"\n'
            "CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY=y\n",
            encoding="ascii",
        )

        image_buffer = bytearray(bytes((0x3D, 0xB8, 0xF3, 0x96)) + bytes(60))
        struct.pack_into("<BBHI", image_buffer, 20, 0, 1, 0, 2)
        image = bytes(image_buffer)
        merged = b":00000001FF\n"
        self.manifest = {
            "release_id": "OTA-0.1alt",
            "version": RELEASES["OTA-0.1alt"]["version"],
            "version_string": RELEASES["OTA-0.1alt"]["version_string"],
            "hardware_ids": [HARDWARE_ID],
            "schedule": "nightly",
            "device_credentials_embedded": False,
            "board": "circuitdojo_feather_nrf9151@1/nrf9151/ns",
            "ncs_version": "3.1.1",
            "build_configuration_file": "release.conf",
            "build_command": ["west", "build", "--board", "circuitdojo_feather_nrf9151@1/nrf9151/ns"],
            "generated_partition_layout": {
                "mcuboot_secondary": {"address": 0x7C000, "size": 0x6C000},
            },
            "generated_protected_storage_configuration": {
                "tfm": {
                    "CONFIG_HW_UNIQUE_KEY": "y",
                    "CONFIG_HW_UNIQUE_KEY_RANDOM": "y",
                    "CONFIG_TFM_PARTITION_PROTECTED_STORAGE": "y",
                    "CONFIG_TFM_PS_ROLLBACK_PROTECTION": "y",
                    "CONFIG_PM_PARTITION_SIZE_TFM_PROTECTED_STORAGE": "0x8000",
                    "CONFIG_PM_PARTITION_SIZE_TFM_INTERNAL_TRUSTED_STORAGE": "0x8000",
                    "CONFIG_PM_PARTITION_SIZE_TFM_OTP_NV_COUNTERS": "0x8000",
                },
            },
            "generated_ota_configuration": {
                "CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION": "0.1.0+2",
                "CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION": "0.1.0+2",
                "CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY": "y",
                "CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS": "900",
                "CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS": "300",
            },
            "generated_boot_configuration": {
                "app": {"CONFIG_MCUBOOT_SIGNATURE_KEY_FILE": "<external-signing-key>"},
                "mcuboot": {
                    "CONFIG_BOOT_SIGNATURE_KEY_FILE": "<external-signing-key>",
                    "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256": "y",
                },
            },
            "signing": {
                "algorithm": "ECDSA-P256",
                "fingerprint": self.fingerprint,
                "fingerprint_algorithm": (
                    "SHA-256 of MCUboot DER-encoded SubjectPublicKeyInfo public key"
                ),
                "private_key_in_artifacts": False,
            },
            "generated_mcuboot_public_key_fingerprint": self.fingerprint,
            "artifact_file": "ota.signed.bin",
            "size_bytes": len(image),
            "sha256": write_artifact(self.root / "ota.signed.bin", image),
            "merged_artifact_file": "merged.hex",
            "merged_size_bytes": len(merged),
            "merged_sha256": write_artifact(self.root / "merged.hex", merged),
        }
        self.manifest_path = self.root / "release-manifest.json"
        self.write_manifest()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_manifest(self):
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_fingerprints_generated_mcu_boot_spki_as_raw_p256_key(self):
        build_dir = self.work_dir / "build"
        mcuboot_dir = build_dir / "mcuboot" / "zephyr"
        mcuboot_dir.mkdir(parents=True)
        spki_prefix = bytes.fromhex(
            "3059301306072a8648ce3d020106082a8648ce3d03010703420004"
        )
        raw_public_key = bytes(range(64))
        public_key = spki_prefix + raw_public_key
        values = ", ".join(f"0x{value:02x}" for value in public_key)
        (mcuboot_dir / "autogen-pubkey.c").write_text(
            f"const unsigned char ecdsa_pub_key[] = {{{values}}};\n",
            encoding="ascii",
        )

        self.assertEqual(
            _generated_boot_public_key_fingerprint(build_dir),
            f"sha256:{hashlib.sha256(public_key).hexdigest()}",
        )

    def test_rejects_non_p256_generated_mcu_boot_key_encoding(self):
        build_dir = self.work_dir / "build"
        mcuboot_dir = build_dir / "mcuboot" / "zephyr"
        mcuboot_dir.mkdir(parents=True)
        (mcuboot_dir / "autogen-pubkey.c").write_text(
            "const unsigned char ecdsa_pub_key[] = {0x04};\n",
            encoding="ascii",
        )

        with self.assertRaisesRegex(ValueError, "not ECDSA-P256"):
            _generated_boot_public_key_fingerprint(build_dir)

    def create_encrypted_test_key(self, passphrase=b"test-only-passphrase"):
        private_key = ec.generate_private_key(ec.SECP256R1())
        self.signing_key.write_bytes(
            private_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.BestAvailableEncryption(passphrase),
            )
        )
        self.signing_key.chmod(0o600)
        public_key = private_key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return f"sha256:{hashlib.sha256(public_key).hexdigest()}"

    @mock.patch("build_ota_release.getpass.getpass", return_value="test-only-passphrase")
    def test_unlocked_signing_key_is_private_temporary_and_fingerprint_preserving(
        self, getpass
    ):
        expected_fingerprint = self.create_encrypted_test_key()
        temporary_directory = None

        with _temporarily_unlocked_signing_key(self.signing_key) as (
            unlocked_key,
            fingerprint,
        ):
            temporary_directory = unlocked_key.parent
            self.assertEqual(fingerprint, expected_fingerprint)
            self.assertEqual(temporary_directory.stat().st_mode & 0o777, 0o700)
            self.assertEqual(unlocked_key.stat().st_mode & 0o777, 0o600)
            self.assertNotEqual(unlocked_key, self.signing_key)
            self.assertNotIn(self.root, unlocked_key.parents)
            decrypted = serialization.load_pem_private_key(
                unlocked_key.read_bytes(), password=None
            )
            self.assertIsInstance(decrypted, ec.EllipticCurvePrivateKey)

        self.assertFalse(temporary_directory.exists())
        getpass.assert_called_once_with("Production MCUboot key passphrase: ")

    @mock.patch("build_ota_release.getpass.getpass", return_value="wrong-passphrase")
    @mock.patch("build_ota_release.tempfile.TemporaryDirectory")
    def test_wrong_passphrase_fails_before_creating_temporary_key(
        self, temporary_directory, getpass
    ):
        self.create_encrypted_test_key()

        with self.assertRaisesRegex(ValueError, "could not unlock"):
            with _temporarily_unlocked_signing_key(self.signing_key):
                self.fail("invalid passphrase must not yield an unlocked key")

        temporary_directory.assert_not_called()
        getpass.assert_called_once()

    @mock.patch("build_ota_release.getpass.getpass", return_value="test-only-passphrase")
    def test_temporary_signing_key_path_is_canonical_with_aliased_temp_directory(
        self, getpass
    ):
        self.create_encrypted_test_key()
        temporary_root = self.work_dir / "temporary-root"
        temporary_root.mkdir()
        temporary_alias = self.work_dir / "temporary-alias"
        temporary_alias.symlink_to(temporary_root, target_is_directory=True)

        with mock.patch.object(tempfile, "tempdir", str(temporary_alias)):
            with _temporarily_unlocked_signing_key(self.signing_key) as (
                unlocked_key,
                _fingerprint,
            ):
                self.assertEqual(unlocked_key, unlocked_key.resolve(strict=True))
                self.assertEqual(unlocked_key.parent.parent, temporary_root.resolve())
                temporary_directory = unlocked_key.parent

        self.assertFalse(temporary_directory.exists())
        getpass.assert_called_once()

    @mock.patch("build_ota_release.getpass.getpass", return_value="test-only-passphrase")
    def test_temporary_signing_key_is_cleaned_after_build_failure(self, getpass):
        self.create_encrypted_test_key()
        temporary_directory = None

        with self.assertRaisesRegex(RuntimeError, "simulated build failure"):
            with _temporarily_unlocked_signing_key(self.signing_key) as (
                unlocked_key,
                _fingerprint,
            ):
                temporary_directory = unlocked_key.parent
                raise RuntimeError("simulated build failure")

        self.assertFalse(temporary_directory.exists())

    @mock.patch("build_ota_release._build_release", return_value=Path("manifest.json"))
    @mock.patch("build_ota_release._west_topdir")
    @mock.patch("build_ota_release.shutil.which")
    @mock.patch("build_ota_release.getpass.getpass", return_value="test-only-passphrase")
    def test_release_builder_passes_only_the_unlocked_key_to_sysbuild(
        self, getpass, which, west_topdir, build_release
    ):
        self.create_encrypted_test_key()
        toolchain_dir = self.work_dir / "toolchain"
        compiler = toolchain_dir / "opt/zephyr-sdk/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc"
        compiler.parent.mkdir(parents=True)
        compiler.touch()
        west = toolchain_dir / "bin/west"
        west.parent.mkdir(parents=True)
        west.touch()
        ncs_dir = self.ncs_dir
        args = type(
            "Args",
            (),
            {
                "release_id": "OTA-0.1",
                "ncs_install_dir": ncs_dir,
                "output_dir": self.work_dir / "new-release",
                "signing_key": self.signing_key,
            },
        )()
        with mock.patch.dict(
            os.environ,
            {"NCS_TOOLCHAIN_DIR": str(toolchain_dir)},
        ):
            which.return_value = str(west)
            west_topdir.return_value = self.work_dir
            result = build_ota_release.build_release(args)

        self.assertEqual(result, Path("manifest.json"))
        passed_args = build_release.call_args.args
        encrypted_key, unlocked_key = passed_args[-3:-1]
        self.assertEqual(encrypted_key, self.signing_key.resolve())
        self.assertNotEqual(unlocked_key, encrypted_key)
        self.assertFalse(unlocked_key.exists())
        getpass.assert_called_once()

    @mock.patch("build_ota_release.signal.signal")
    def test_termination_signal_handlers_are_restored_after_interruption(self, signal_call):
        signal_call.return_value = signal.default_int_handler

        with self.assertRaises(SystemExit) as raised:
            with build_ota_release._cleanup_on_termination_signals():
                handler = signal_call.call_args_list[0].args[1]
                handler(signal.SIGTERM, None)

        self.assertEqual(raised.exception.code, 128 + signal.SIGTERM)
        self.assertEqual(signal_call.call_count, 12)

    def test_artifact_leak_check_covers_encrypted_and_unlocked_key_bytes(self):
        from build_ota_release import _assert_private_key_not_embedded

        encrypted_bytes = b"encrypted-private-key-test"
        unlocked_bytes = b"unlocked-private-key-test"
        encrypted_key = self.work_dir / "encrypted.pem"
        unlocked_key = self.work_dir / "unlocked.pem"
        artifact = self.work_dir / "artifact.bin"
        encrypted_key.write_bytes(encrypted_bytes)
        unlocked_key.write_bytes(unlocked_bytes)
        artifact.write_bytes(b"release" + unlocked_bytes)

        with self.assertRaisesRegex(ValueError, "private signing key material"):
            _assert_private_key_not_embedded(
                (artifact,),
                (encrypted_key, unlocked_key),
            )

    @mock.patch("verify_ota_release._verify_mcuboot_signature")
    @mock.patch("verify_ota_release._reject_nordic_development_key")
    @mock.patch("verify_ota_release._public_key_fingerprint")
    @mock.patch("verify_ota_release.shutil.which", return_value="/fake/west")
    def test_verifies_common_image_hashes_layout_and_signature(
        self, which, public_key_fingerprint, reject_development_key, verify_signature
    ):
        public_key_fingerprint.return_value = self.fingerprint
        result = verify_ota_release.verify_release(
            self.manifest_path, self.ncs_dir, self.signing_key
        )
        self.assertEqual(result["release_id"], "OTA-0.1alt")
        verify_signature.assert_called_once()
        reject_development_key.assert_called_once()

    def test_rejects_artifact_marked_with_embedded_credentials(self):
        self.manifest["device_credentials_embedded"] = True
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "must not embed"):
            verify_ota_release.verify_release(
                self.manifest_path, self.ncs_dir, self.signing_key
            )

    def test_rejects_release_version_or_schedule_mismatch(self):
        self.manifest["version_string"] = "0.1.0+1"
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "identity or schedule"):
            verify_ota_release.verify_release(
                self.manifest_path, self.ncs_dir, self.signing_key
            )

    @mock.patch(
        "verify_ota_release._public_key_fingerprint",
        return_value="sha256:" + "a" * 64,
    )
    def test_rejects_changed_signed_image(self, public_key_fingerprint):
        (self.root / "ota.signed.bin").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "size does not match"):
            verify_ota_release.verify_release(self.manifest_path, self.ncs_dir, self.signing_key)

    def test_rejects_signed_image_version_mismatch(self):
        image = bytearray((self.root / "ota.signed.bin").read_bytes())
        struct.pack_into("<BBHI", image, 20, 0, 1, 0, 1)
        self.manifest["sha256"] = write_artifact(self.root / "ota.signed.bin", bytes(image))
        self.write_manifest()
        with mock.patch("verify_ota_release.shutil.which", return_value="/fake/west"):
            with mock.patch(
                "verify_ota_release._public_key_fingerprint",
                return_value=self.fingerprint,
            ):
                with self.assertRaisesRegex(ValueError, "image version"):
                    verify_ota_release.verify_release(
                        self.manifest_path, self.ncs_dir, self.signing_key
                    )

    @mock.patch(
        "verify_ota_release._public_key_fingerprint",
        return_value="sha256:" + "b" * 64,
    )
    def test_rejects_mismatched_signing_key_fingerprint(self, public_key_fingerprint):
        with self.assertRaisesRegex(ValueError, "fingerprint does not match"):
            verify_ota_release.verify_release(
                self.manifest_path, self.ncs_dir, self.signing_key
            )

    def test_rejects_group_or_world_readable_private_key(self):
        self.signing_key.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "owner-only"):
            verify_ota_release.verify_release(
                self.manifest_path, self.ncs_dir, self.signing_key
            )


if __name__ == "__main__":
    unittest.main()
