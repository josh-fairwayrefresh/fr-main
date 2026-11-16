import tempfile
import unittest
from pathlib import Path

from protect_ota import artifact, digest, public_anchor


class ArtifactRecoveryTest(unittest.TestCase):
    def test_artifact_requires_exact_bytes_and_safe_path(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name)
            path = folder / "firmware.bin"
            path.write_bytes(b"accepted")
            manifest = {"file": path.name, "hash": digest(path)}
            self.assertEqual(artifact(folder, manifest, "file", "hash"), path)
            path.write_bytes(b"corrupt")
            with self.assertRaisesRegex(ValueError, "checksum"):
                artifact(folder, manifest, "file", "hash")
            manifest["file"] = "../firmware.bin"
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                artifact(folder, manifest, "file", "hash")

    def test_unrelated_bootloader_key_is_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / "boot.hex"
            path.write_text(":00000001FF\n")
            with self.assertRaisesRegex(ValueError, "public trust anchor"):
                public_anchor(path, "sha256:" + "0" * 64)
