#!/usr/bin/env python3
"""Verify a credential-free Fairway OTA release artifact and MCUboot signature."""

import argparse
import json
from pathlib import Path
import re
import shutil
import struct
import sys

from build_device_firmware import (
    _ncs_imgtool,
    _sha256_file,
    _verify_mcuboot_signature,
)
from build_ota_release import (
    HARDWARE_ID,
    RELEASES,
    SECONDARY_SLOT_BYTES,
    MAX_SIGNED_IMAGE_BYTES,
    _validate_image_size,
    _assert_private_key_not_embedded,
    _public_key_fingerprint,
    _reject_nordic_development_key,
    _validate_signing_key,
)


def verify_release(manifest_path: Path, ncs_install_dir: Path, signing_key: Path) -> dict:
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("release manifest must be a regular, non-symlink file")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    release = RELEASES.get(manifest.get("release_id"))
    if release is None or manifest.get("version") != release["version"] \
            or manifest.get("version_string") != release["version_string"] \
            or manifest.get("schedule") != release["schedule"]:
        raise ValueError("manifest release identity or schedule is invalid")
    if manifest.get("hardware_ids") != [HARDWARE_ID]:
        raise ValueError("manifest hardware target is invalid")
    ota_config = manifest.get("generated_ota_configuration")
    expected_schedule_option = (
        "CONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME"
        if release["schedule"] == "one_time"
        else "CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY"
    )
    if not isinstance(ota_config, dict) \
            or ota_config.get("CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION") != release["version_string"] \
            or ota_config.get("CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION") != release["version_string"] \
            or ota_config.get(expected_schedule_option) != "y":
        raise ValueError("generated firmware version or schedule does not match the release")
    if release["schedule"] == "one_time" \
            and ota_config.get("CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS") != "900":
        raise ValueError("OTA 0.1 must have a persisted 900-second initial check delay")
    if ota_config.get("CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS") != "300":
        raise ValueError("generated firmware trial timeout does not match the commissioning policy")
    if manifest.get("device_credentials_embedded") is not False:
        raise ValueError("common OTA artifact must not embed device credentials")
    if manifest.get("board") != "circuitdojo_feather_nrf9151@1/nrf9151/ns" \
            or manifest.get("ncs_version") != "3.1.1":
        raise ValueError("manifest board or SDK version is unsupported")
    root = manifest_path.parent.resolve(strict=True)
    signing_key = _validate_signing_key(signing_key, root)
    signing = manifest.get("signing")
    if not isinstance(signing, dict) \
            or signing.get("algorithm") != "ECDSA-P256" \
            or signing.get("fingerprint_algorithm") != (
                "SHA-256 of MCUboot DER-encoded SubjectPublicKeyInfo public key"
            ) \
            or signing.get("private_key_in_artifacts") is not False:
        raise ValueError("manifest signing-key metadata is missing or invalid")
    boot_configuration = manifest.get("generated_boot_configuration")
    app_configurations = [
        config for config in boot_configuration.values()
        if isinstance(config, dict) and "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE" in config
    ] if isinstance(boot_configuration, dict) else []
    mcuboot_configurations = [
        config for config in boot_configuration.values()
        if isinstance(config, dict) and "CONFIG_BOOT_SIGNATURE_KEY_FILE" in config
    ] if isinstance(boot_configuration, dict) else []
    if len(app_configurations) != 1 or len(mcuboot_configurations) != 1 \
            or app_configurations[0]["CONFIG_MCUBOOT_SIGNATURE_KEY_FILE"] != "<external-signing-key>" \
            or mcuboot_configurations[0]["CONFIG_BOOT_SIGNATURE_KEY_FILE"] != "<external-signing-key>" \
            or mcuboot_configurations[0].get("CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256") != "y":
        raise ValueError("manifest does not record a consistent ECDSA-P256 MCUboot trust anchor")
    imgtool = _ncs_imgtool(ncs_install_dir)
    signing_fingerprint = _public_key_fingerprint(signing_key, imgtool)
    if signing.get("fingerprint") != signing_fingerprint \
            or manifest.get("generated_mcuboot_public_key_fingerprint") != signing_fingerprint:
        raise ValueError("supplied signing key fingerprint does not match the manifest or MCUboot key")
    command = manifest.get("build_command")
    if not isinstance(command, list) or not all(isinstance(part, str) for part in command) \
            or any("FAIRWAY_DEVICE_ID" in part or "FAIRWAY_DEVICE_KEY" in part
                   or "DEVICE_KEY_HEADER" in part or "DEVICE_SECRETS_DIR" in part
                   for part in command):
        raise ValueError("common image build command must not select device credentials")
    partitions = manifest.get("generated_partition_layout")
    secondary = partitions.get("mcuboot_secondary") if isinstance(partitions, dict) else None
    if not isinstance(secondary, dict) or secondary.get("size") != SECONDARY_SLOT_BYTES:
        raise ValueError("manifest MCUboot secondary slot size is invalid")
    capacity = manifest.get("generated_image_capacity")
    if manifest["release_id"].endswith("-r2") or capacity is not None:
        expected = {
            "raw_slot_bytes": SECONDARY_SLOT_BYTES, "erase_block_bytes": 4096,
            "write_block_bytes": 4, "max_image_sectors": 256, "trailer_bytes": 3120,
            "reserved_trailer_bytes": 4096, "move_workspace_bytes": 4096,
            "max_signed_image_bytes": MAX_SIGNED_IMAGE_BYTES,
        }
        if not isinstance(capacity, dict) or any(
            capacity.get(key) != value for key, value in expected.items()
        ) or re.fullmatch(r"[a-f0-9]{64}", str(capacity.get("mcuboot_dts_sha256", ""))) is None:
            raise ValueError("manifest effective MCUboot image capacity is invalid")
    storage_configs = manifest.get("generated_protected_storage_configuration")
    if not isinstance(storage_configs, dict):
        raise ValueError("manifest protected-storage configuration is missing")
    storage_values = {
        key: value
        for config in storage_configs.values()
        if isinstance(config, dict)
        for key, value in config.items()
    }
    for key in (
        "CONFIG_HW_UNIQUE_KEY",
        "CONFIG_HW_UNIQUE_KEY_RANDOM",
        "CONFIG_TFM_PARTITION_PROTECTED_STORAGE",
        "CONFIG_TFM_PS_ROLLBACK_PROTECTION",
    ):
        if storage_values.get(key) != "y":
            raise ValueError(f"manifest does not enable required protected-storage option {key}")
    for key in (
        "CONFIG_PM_PARTITION_SIZE_TFM_PROTECTED_STORAGE",
        "CONFIG_PM_PARTITION_SIZE_TFM_INTERNAL_TRUSTED_STORAGE",
        "CONFIG_PM_PARTITION_SIZE_TFM_OTP_NV_COUNTERS",
    ):
        try:
            size = int(storage_values[key], 0)
        except (KeyError, ValueError) as exc:
            raise ValueError(f"manifest is missing protected-storage partition size {key}") from exc
        if size != 0x8000:
            raise ValueError(f"manifest protected-storage partition size {key} is invalid")

    config_name = manifest.get("build_configuration_file")
    if not isinstance(config_name, str) or Path(config_name).name != config_name:
        raise ValueError("release build configuration filename is invalid")
    config_path = root / config_name
    if config_path.is_symlink() or not config_path.is_file() or config_path.resolve().parent != root:
        raise ValueError("release build configuration is missing or not a local regular file")
    expected_config = (
        f'CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION="{release["version_string"]}"',
        f'CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION="{release["version_string"]}"',
        "CONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME=y"
        if release["schedule"] == "one_time"
        else "CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY=y",
    )
    config_lines = config_path.read_text(encoding="ascii").splitlines()
    if not all(line in config_lines for line in expected_config):
        raise ValueError("release build configuration does not match the manifest")
    if any("FAIRWAY_DEVICE_ID" in line or "FAIRWAY_DEVICE_KEY" in line for line in config_lines):
        raise ValueError("release build configuration contains device-specific identity")

    artifacts = (
        ("artifact_file", "size_bytes", "sha256"),
        ("merged_artifact_file", "merged_size_bytes", "merged_sha256"),
    )
    for name_key, size_key, digest_key in artifacts:
        filename = manifest.get(name_key)
        if not isinstance(filename, str) or Path(filename).name != filename:
            raise ValueError(f"{name_key} must be a local artifact filename")
        artifact = root / filename
        if artifact.is_symlink() or not artifact.is_file() or artifact.resolve().parent != root:
            raise ValueError(f"{name_key} is missing or not a local regular file")
        if artifact.stat().st_size != manifest.get(size_key):
            raise ValueError(f"{name_key} size does not match the manifest")
        digest = manifest.get(digest_key)
        if not isinstance(digest, str) or re.fullmatch(r"[a-f0-9]{64}", digest) is None \
                or _sha256_file(artifact) != digest:
            raise ValueError(f"{name_key} SHA-256 does not match the manifest")
        if name_key == "artifact_file":
            _validate_image_size(artifact.stat().st_size)
            image = artifact.read_bytes()
            if image[:4] != bytes((0x3D, 0xB8, 0xF3, 0x96)):
                raise ValueError("signed artifact does not contain a valid MCUboot image header")
            version = struct.unpack_from("<BBHI", image, 20)
            expected_version = release["version"]
            if version != (
                expected_version["major"],
                expected_version["minor"],
                expected_version["revision"],
                expected_version["build"],
            ):
                raise ValueError("signed MCUboot image version does not match the release")

    ncs_dir = ncs_install_dir.resolve(strict=True)
    version_file = ncs_dir / "nrf" / "VERSION"
    if not version_file.is_file() or version_file.read_text(encoding="utf-8").strip() != "3.1.1":
        raise ValueError("NCS_INSTALL_DIR must be the installed nRF Connect SDK v3.1.1")
    west = shutil.which("west")
    if not west:
        raise ValueError("matching Nordic West must be available to verify the MCUboot signing key")
    ota_artifact = root / manifest["artifact_file"]
    _verify_mcuboot_signature(ota_artifact, signing_key, imgtool)
    _reject_nordic_development_key(
        ota_artifact, imgtool, ncs_dir, signing_fingerprint
    )
    _assert_private_key_not_embedded(
        (ota_artifact, root / manifest["merged_artifact_file"]),
        signing_key,
    )
    print(f"Verified {manifest['release_id']} ({manifest['version_string']})")
    print(f"Image SHA-256: {manifest['sha256']}")
    print("Device credentials are not embedded; MCUboot signature is valid.")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--ncs-install-dir", required=True, type=Path)
    parser.add_argument("--signing-key", required=True, type=Path)
    args = parser.parse_args()
    try:
        verify_release(args.manifest, args.ncs_install_dir, args.signing_key)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"OTA release verification failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
