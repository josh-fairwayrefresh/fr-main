#!/usr/bin/env python3
"""Verify artifact integrity and embedded device-specific provisioning."""

import argparse
from pathlib import Path
import sys

from build_device_firmware import verify_artifact


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--secrets-dir", required=True, type=Path)
    parser.add_argument("--input-file", type=Path)
    parser.add_argument("--ncs-install-dir", type=Path)
    args = parser.parse_args()
    try:
        manifest = verify_artifact(
            args.artifact,
            args.manifest,
            args.device_id,
            args.secrets_dir,
            args.input_file,
            ncs_install_dir=args.ncs_install_dir,
        )
    except (OSError, ValueError) as exc:
        print(f"artifact verification failed: {exc}", file=sys.stderr)
        return 1
    print(
        f"Verified {args.device_id}: {args.artifact} "
        f"({manifest['size_bytes']} bytes, SHA-256 {manifest['sha256']})"
    )
    if "ota_artifact_file" in manifest:
        ota_artifact = args.manifest.parent / manifest["ota_artifact_file"]
        print(
            f"Verified MCUboot OTA image: {ota_artifact} "
            f"({manifest['ota_size_bytes']} bytes, SHA-256 {manifest['ota_sha256']})"
        )
        print("Verified MCUboot image signature with the generated signing key.")
    print("Embedded Device ID and credential match the selected protected input.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
