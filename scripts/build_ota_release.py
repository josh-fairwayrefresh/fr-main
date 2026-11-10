#!/usr/bin/env python3
"""Build a common, credential-free signed OTA release for the nRF9151 Feather."""

import argparse
from contextlib import contextmanager
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import struct
import subprocess
import sys
import tempfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from build_device_firmware import (
    BOARD,
    APPLICATION_CONFIGURATION,
    _configured_ota_signing_key,
    _generated_boot_configuration,
    _generated_partition_device_tree,
    _generated_partition_layout,
    _protect_tree,
    _sha256_file,
    _verify_mcuboot_signature,
    _west_topdir,
    _build_source_sha256,
    _build_source_files,
)


REPOSITORY_DIR = Path(__file__).resolve().parents[1]
APPLICATION_DIR = REPOSITORY_DIR / "samples" / "fairway_power_sandbox"
NCS_VERSION = "3.1.1"
SECONDARY_SLOT_BYTES = 0x6C000
MAX_SIGNED_IMAGE_BYTES = 0x6A000
HARDWARE_ID = "circuitdojo_feather_nrf9151@1/nrf9151/ns"
RELEASES = {
    "OTA-0.1": {
        "version": {"major": 0, "minor": 1, "revision": 0, "build": 1},
        "version_string": "0.1.0+1",
        "schedule": "one_time",
    },
    "OTA-0.1alt": {
        "version": {"major": 0, "minor": 1, "revision": 0, "build": 2},
        "version_string": "0.1.0+2",
        "schedule": "nightly",
    },
    "OTA-1.0": {
        "version": {"major": 1, "minor": 0, "revision": 0, "build": 1},
        "version_string": "1.0.0+1",
        "schedule": "nightly",
    },
    "OTA-0.1alt-r2": {
        "version": {"major": 0, "minor": 1, "revision": 0, "build": 3},
        "version_string": "0.1.0+3",
        "schedule": "nightly",
    },
    "OTA-1.0-r2": {
        "version": {"major": 1, "minor": 0, "revision": 0, "build": 2},
        "version_string": "1.0.0+2",
        "schedule": "nightly",
    },
}


def _validate_image_size(size: int) -> None:
    if size < 32 or size > MAX_SIGNED_IMAGE_BYTES:
        raise ValueError("signed MCUboot image exceeds the effective 424 KiB move-swap limit")


def _generated_image_capacity(build_dir: Path, layout: dict, boot_config: dict) -> dict:
    if any(any(layout.get(name, {}).get(key) != value for key, value in expected.items())
           for name, expected in {
        "mcuboot_primary": {"address": 0x10000, "size": SECONDARY_SLOT_BYTES},
        "mcuboot_secondary": {"address": 0x7C000, "size": SECONDARY_SLOT_BYTES},
    }.items()):
        raise ValueError("generated image slots differ from the approved move-swap layout")
    boot = boot_config.get("mcuboot/zephyr", {})
    if boot.get("CONFIG_BOOT_SWAP_USING_MOVE") != "y" \
            or boot.get("CONFIG_BOOT_MAX_IMG_SECTORS") != "256":
        raise ValueError("generated MCUboot move-swap configuration differs from the approved layout")
    config = (build_dir / "mcuboot" / "zephyr" / ".config").read_text(encoding="utf-8")
    if re.search(r"^CONFIG_BOOT_ENCRYPT_(RSA|EC256|X25519)=y$", config, re.MULTILINE):
        raise ValueError("generated MCUboot image encryption changes the approved trailer layout")
    dts = build_dir / "mcuboot" / "zephyr" / "zephyr.dts"
    text = dts.read_text(encoding="utf-8")
    # Bind geometry to internal flash, not the unrelated external LittleFS device.
    flash = re.search(r"(?m)^\s*flash0:\s*flash@0\s*\{(.*?)^\s*\};", text, re.DOTALL)
    if flash is None:
        raise ValueError("generated MCUboot internal flash geometry is missing")
    geometry = {}
    for prop in ("erase-block-size", "write-block-size"):
        match = re.search(rf"{prop}\s*=\s*<\s*(0x[0-9a-fA-F]+|\d+)\s*>", flash.group(1))
        if match is None:
            raise ValueError(f"generated MCUboot {prop} is missing")
        geometry[prop] = int(match.group(1), 0)
    if geometry != {"erase-block-size": 4096, "write-block-size": 4}:
        raise ValueError("generated MCUboot flash geometry differs from the approved layout")
    trailer = 256 * 3 * geometry["write-block-size"] + 4 * 8 + 16
    erase = geometry["erase-block-size"]
    reserved_trailer = ((trailer + erase - 1) // erase) * erase
    maximum = SECONDARY_SLOT_BYTES - reserved_trailer - erase
    if maximum != MAX_SIGNED_IMAGE_BYTES:
        raise ValueError("generated MCUboot capacity differs from the approved 424 KiB limit")
    return {
        "raw_slot_bytes": SECONDARY_SLOT_BYTES,
        "erase_block_bytes": erase,
        "write_block_bytes": geometry["write-block-size"],
        "max_image_sectors": 256,
        "trailer_bytes": trailer,
        "reserved_trailer_bytes": reserved_trailer,
        "move_workspace_bytes": erase,
        "max_signed_image_bytes": maximum,
        "mcuboot_dts_sha256": _sha256_file(dts),
    }


def _validate_output_dir(output_dir: Path) -> Path:
    if output_dir.exists() or output_dir.is_symlink():
        raise ValueError("output directory must not exist; choose a fresh path")
    resolved = output_dir.resolve()
    if resolved == REPOSITORY_DIR or REPOSITORY_DIR in resolved.parents:
        raise ValueError("output directory must be outside the source checkout")
    return resolved


def _validate_signing_key(signing_key: Path, output_dir: Path) -> Path:
    if signing_key.is_symlink():
        raise ValueError("signing key must be a regular, non-symlink file")
    try:
        resolved = signing_key.resolve(strict=True)
        metadata = resolved.stat()
    except OSError as exc:
        raise ValueError("signing key is missing or inaccessible") from exc
    if not resolved.is_file():
        raise ValueError("signing key must be a regular file")
    if stat.S_IMODE(metadata.st_mode) & 0o077:
        raise ValueError("signing key permissions must be owner-only (0600)")
    if resolved == REPOSITORY_DIR or REPOSITORY_DIR in resolved.parents:
        raise ValueError("signing key must be outside the source checkout")
    if resolved == output_dir or output_dir in resolved.parents:
        raise ValueError("signing key must be outside the release output directory")
    return resolved


def _public_key_fingerprint(signing_key: Path, imgtool: Path) -> str:
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(imgtool),
                "getpubhash",
                "--key",
                str(signing_key),
                "--encoding",
                "raw",
            ],
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        raise ValueError("could not derive MCUboot public-key fingerprint") from exc
    if result.returncode != 0 or len(result.stdout) != 32:
        raise ValueError("could not derive MCUboot SHA-256 public-key fingerprint")
    return f"sha256:{result.stdout.hex()}"


@contextmanager
def _temporarily_unlocked_signing_key(signing_key: Path):
    passphrase = getpass.getpass("Production MCUboot key passphrase: ")
    try:
        private_key = serialization.load_pem_private_key(
            signing_key.read_bytes(),
            password=passphrase.encode("utf-8"),
        )
    except (OSError, TypeError, ValueError) as exc:
        raise ValueError("could not unlock the production MCUboot signing key") from exc
    finally:
        passphrase = ""

    if not isinstance(private_key, ec.EllipticCurvePrivateKey) \
            or not isinstance(private_key.curve, ec.SECP256R1):
        raise ValueError("production MCUboot signing key must be ECDSA-P256")

    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    fingerprint = f"sha256:{hashlib.sha256(public_key).hexdigest()}"
    unencrypted_key = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )

    with tempfile.TemporaryDirectory(prefix="fairway-mcuboot-signing-") as temp_dir:
        os.chmod(temp_dir, 0o700)
        unlocked_key = Path(temp_dir).resolve(strict=True) / "signing-key.pem"
        descriptor = os.open(
            unlocked_key,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            stat.S_IRUSR | stat.S_IWUSR,
        )
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(unencrypted_key)
        yield unlocked_key, fingerprint


@contextmanager
def _cleanup_on_termination_signals():
    previous_handlers = {}

    def terminate(signum, _frame):
        raise SystemExit(128 + signum)

    handled_signals = (
        signal.SIGTERM,
        signal.SIGINT,
        signal.SIGHUP,
        signal.SIGTSTP,
        signal.SIGTTIN,
        signal.SIGTTOU,
    )
    try:
        for signum in handled_signals:
            previous_handlers[signum] = signal.signal(signum, terminate)
        yield
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


def _generated_boot_public_key_fingerprint(build_dir: Path) -> str:
    public_key_files = list(build_dir.rglob("autogen-pubkey.c"))
    if len(public_key_files) != 1:
        raise ValueError("build must generate exactly one MCUboot public verification key")
    source = public_key_files[0].read_text(encoding="ascii")
    match = re.search(
        r"const unsigned char \w+_pub_key\[\] = \{(.*?)\};",
        source,
        flags=re.DOTALL,
    )
    if match is None:
        raise ValueError("generated MCUboot public verification key is malformed")
    public_key = bytes(
        int(value, 16)
        for value in re.findall(r"0x([0-9a-fA-F]{2})", match.group(1))
    )
    spki_prefix = bytes.fromhex(
        "3059301306072a8648ce3d020106082a8648ce3d03010703420004"
    )
    if len(public_key) != len(spki_prefix) + 64 or not public_key.startswith(spki_prefix):
        raise ValueError("generated MCUboot public key is not ECDSA-P256")
    return f"sha256:{hashlib.sha256(public_key).hexdigest()}"


def _reject_nordic_development_key(
    artifact: Path, imgtool: Path, ncs_dir: Path, fingerprint: str
) -> None:
    development_key = ncs_dir / "bootloader" / "mcuboot" / "root-ec-p256.pem"
    if _public_key_fingerprint(development_key, imgtool) == fingerprint:
        raise ValueError("production signing key must not be the NCS development key")
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(imgtool),
                "verify",
                "--key",
                str(development_key),
                str(artifact),
            ],
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        raise ValueError("could not test rejection of the NCS development signing key") from exc
    if result.returncode == 0:
        raise ValueError("signed artifact is also accepted by the NCS development key")


def _assert_private_key_not_embedded(
    artifacts: tuple[Path, ...],
    signing_keys: Path | tuple[Path, ...],
) -> None:
    keys = (signing_keys,) if isinstance(signing_keys, Path) else signing_keys
    try:
        private_keys = tuple(key.read_bytes() for key in keys)
    except OSError as exc:
        raise ValueError("signing key could not be checked for artifact leakage") from exc
    for artifact in artifacts:
        contents = artifact.read_bytes()
        if any(private_key in contents for private_key in private_keys):
            raise ValueError(f"private signing key material appears in {artifact.name}")


def _redact_signing_paths(configuration: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
    redacted = {image: dict(values) for image, values in configuration.items()}
    for values in redacted.values():
        for option in ("CONFIG_BOOT_SIGNATURE_KEY_FILE", "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE"):
            if option in values:
                values[option] = "<external-signing-key>"
    return redacted


def _require_ncs(ncs_dir: Path) -> None:
    version_file = ncs_dir / "nrf" / "VERSION"
    if not version_file.is_file() or version_file.read_text(encoding="utf-8").strip() != NCS_VERSION:
        raise ValueError("NCS_INSTALL_DIR must be the installed nRF Connect SDK v3.1.1")


def _generated_config_value(build_dir: Path, key: str) -> str | None:
    values = []
    for path in build_dir.rglob(".config"):
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith(f"{key}="):
                values.append(line.split("=", 1)[1].strip('"'))
    return values[0] if values and all(value == values[0] for value in values) else None


def _generated_protected_storage_configuration(build_dir: Path) -> dict[str, dict[str, str]]:
    tracked = {
        "CONFIG_HW_UNIQUE_KEY",
        "CONFIG_HW_UNIQUE_KEY_RANDOM",
        "CONFIG_TFM_PARTITION_PROTECTED_STORAGE",
        "CONFIG_TFM_PS_ROLLBACK_PROTECTION",
        "CONFIG_PM_PARTITION_SIZE_TFM",
        "CONFIG_PM_PARTITION_SIZE_TFM_PROTECTED_STORAGE",
        "CONFIG_PM_PARTITION_SIZE_TFM_INTERNAL_TRUSTED_STORAGE",
        "CONFIG_PM_PARTITION_SIZE_TFM_OTP_NV_COUNTERS",
    }
    configurations = {}
    for path in sorted(build_dir.rglob(".config")):
        selected = {}
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("CONFIG_") and "=" in line:
                name, value = line.split("=", 1)
                if name in tracked:
                    selected[name] = value.strip('"')
        if selected:
            configurations[path.parent.relative_to(build_dir).as_posix() or "."] = selected

    flattened = {}
    for config in configurations.values():
        flattened.update(config)
    for key in (
        "CONFIG_HW_UNIQUE_KEY",
        "CONFIG_HW_UNIQUE_KEY_RANDOM",
        "CONFIG_TFM_PARTITION_PROTECTED_STORAGE",
        "CONFIG_TFM_PS_ROLLBACK_PROTECTION",
    ):
        if flattened.get(key) != "y":
            raise ValueError(f"generated firmware does not enable required protected-storage option {key}")
    for key in (
        "CONFIG_PM_PARTITION_SIZE_TFM_PROTECTED_STORAGE",
        "CONFIG_PM_PARTITION_SIZE_TFM_INTERNAL_TRUSTED_STORAGE",
        "CONFIG_PM_PARTITION_SIZE_TFM_OTP_NV_COUNTERS",
    ):
        try:
            size = int(flattened[key], 0)
        except (KeyError, ValueError) as exc:
            raise ValueError(f"generated firmware is missing protected-storage partition size {key}") from exc
        if size != 0x8000:
            raise ValueError(f"generated protected-storage partition size {key} does not match the layout")
    return configurations


def build_release(args: argparse.Namespace) -> Path:
    release = RELEASES.get(args.release_id)
    if release is None:
        raise ValueError("release ID must identify a supported immutable OTA release")
    ncs_dir = args.ncs_install_dir.resolve(strict=True)
    _require_ncs(ncs_dir)

    toolchain_value = os.environ.get("NCS_TOOLCHAIN_DIR")
    if not toolchain_value:
        raise ValueError("NCS_TOOLCHAIN_DIR must identify the matching Nordic toolchain bundle")
    toolchain_dir = Path(toolchain_value).resolve(strict=True)
    west = shutil.which("west")
    compiler = toolchain_dir / "opt" / "zephyr-sdk" / "arm-zephyr-eabi" / "bin" / "arm-zephyr-eabi-gcc"
    if not west or not compiler.is_file():
        raise ValueError("matching Nordic West and ARM compiler must be available in the environment")
    west_path = Path(west).resolve()
    if toolchain_dir not in west_path.parents:
        raise ValueError("west must resolve from the selected Nordic toolchain bundle")
    west_topdir = _west_topdir(west, ncs_dir)
    output_dir = _validate_output_dir(args.output_dir)
    encrypted_signing_key = _validate_signing_key(args.signing_key, output_dir)
    with _temporarily_unlocked_signing_key(encrypted_signing_key) as (
        build_signing_key,
        signing_fingerprint,
    ):
        return _build_release(
            args,
            release,
            ncs_dir,
            toolchain_dir,
            west,
            west_topdir,
            output_dir,
            encrypted_signing_key,
            build_signing_key,
            signing_fingerprint,
        )


def _build_release(
    args: argparse.Namespace,
    release: dict,
    ncs_dir: Path,
    toolchain_dir: Path,
    west: str,
    west_topdir: Path,
    output_dir: Path,
    encrypted_signing_key: Path,
    signing_key: Path,
    signing_fingerprint: str,
) -> Path:
    imgtool = ncs_dir / "bootloader" / "mcuboot" / "scripts" / "imgtool.py"

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    old_umask = os.umask(0o077)
    try:
        output_dir.mkdir(mode=0o700)
    finally:
        os.umask(old_umask)

    build_dir = output_dir / "build"
    config_path = output_dir / "release.conf"
    schedule_option = (
        "CONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME"
        if release["schedule"] == "one_time"
        else "CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY"
    )
    config_path.write_text(
        f'CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION="{release["version_string"]}"\n'
        f'CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION="{release["version_string"]}"\n'
        f"{schedule_option}=y\n",
        encoding="ascii",
    )
    config_path.chmod(stat.S_IRUSR | stat.S_IWUSR)

    env = os.environ.copy()
    env["ZEPHYR_TOOLCHAIN_VARIANT"] = "zephyr"
    env["ZEPHYR_SDK_INSTALL_DIR"] = str(toolchain_dir / "opt" / "zephyr-sdk")
    for variable in ("FAIRWAY_DEVICE_ID", "FAIRWAY_DEVICE_KEY", "FAIRWAY_DEVICE_SECRETS_DIR",
                     "FAIRWAY_DEVICE_KEY_HEADER"):
        env.pop(variable, None)

    command = [
        west, "build", "--build-dir", str(build_dir), "--pristine=always",
        str(APPLICATION_DIR), "--board", BOARD, "--",
        f"-DBOARD_ROOT={REPOSITORY_DIR}",
        f"-DEXTRA_CONF_FILE={APPLICATION_CONFIGURATION};{config_path}",
        "-DDEBUG_THREAD_INFO=On",
        "-DCONFIG_DEBUG_THREAD_INFO=y",
        "-Dfairway_power_sandbox_DEBUG_THREAD_INFO=On",
        "-Dmcuboot_DEBUG_THREAD_INFO=Off",
        "-DSB_CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256=y",
        f'-DSB_CONFIG_BOOT_SIGNATURE_KEY_FILE="{signing_key}"',
    ]
    try:
        subprocess.run(command, cwd=ncs_dir, env=env, check=True)
        merged_hex = build_dir / "merged.hex"
        ota_image = build_dir / "fairway_power_sandbox" / "zephyr" / "zephyr.signed.bin"
        if not merged_hex.is_file() or ota_image.is_symlink() or not ota_image.is_file():
            raise ValueError("successful build did not produce the merged and signed MCUboot images")
        if _generated_config_value(build_dir, "CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION") != release["version_string"]:
            raise ValueError("generated firmware version does not match the selected release")
        if _generated_config_value(build_dir, "CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION") != release["version_string"]:
            raise ValueError("generated MCUboot image version does not match the selected release")
        schedule_option = (
            "CONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME"
            if release["schedule"] == "one_time"
            else "CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY"
        )
        if _generated_config_value(build_dir, schedule_option) != "y":
            raise ValueError("generated firmware schedule does not match the selected release")
        ota_configuration = {
            "CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION": release["version_string"],
            "CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION": release["version_string"],
            schedule_option: "y",
            "CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS": (
                _generated_config_value(build_dir, "CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS")
            ),
            "CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS": (
                _generated_config_value(build_dir, "CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS")
            ),
        }
        if (
            ota_configuration["CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS"] != "300"
            or (
                release["schedule"] == "one_time"
                and ota_configuration["CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS"] != "900"
            )
        ):
            raise ValueError("generated OTA delay or trial timeout does not match the commissioning policy")

        partition_layout = _generated_partition_layout(build_dir)
        protected_storage_configuration = _generated_protected_storage_configuration(build_dir)
        secondary = partition_layout["mcuboot_secondary"]
        if secondary["size"] != SECONDARY_SLOT_BYTES:
            raise ValueError("generated secondary slot does not match the configured 432 KiB OTA limit")
        _validate_image_size(ota_image.stat().st_size)
        boot_config = _generated_boot_configuration(build_dir)
        image_capacity = _generated_image_capacity(build_dir, partition_layout, boot_config)
        image_header = ota_image.read_bytes()
        if image_header[:4] != bytes((0x3D, 0xB8, 0xF3, 0x96)):
            raise ValueError("signed artifact does not contain a valid MCUboot image header")
        image_version = struct.unpack_from("<BBHI", image_header, 20)
        if image_version != (
            release["version"]["major"],
            release["version"]["minor"],
            release["version"]["revision"],
            release["version"]["build"],
        ):
            raise ValueError("signed MCUboot image version does not match the selected release")

        merged_name = f"{args.release_id}-merged.hex"
        ota_name = f"{args.release_id}-ota.signed.bin"
        merged_artifact = output_dir / merged_name
        ota_artifact = output_dir / ota_name
        shutil.copyfile(merged_hex, merged_artifact)
        shutil.copyfile(ota_image, ota_artifact)
        _protect_tree(output_dir)

        configured_key = _configured_ota_signing_key(
            boot_config, APPLICATION_DIR, west_topdir, ncs_dir
        )
        if configured_key != signing_key:
            raise ValueError("generated MCUboot signing key does not match the supplied key")
        generated_public_fingerprint = _generated_boot_public_key_fingerprint(build_dir)
        if generated_public_fingerprint != signing_fingerprint:
            raise ValueError("compiled MCUboot public key does not match the supplied signing key")
        _verify_mcuboot_signature(ota_artifact, signing_key, imgtool)
        _reject_nordic_development_key(
            ota_artifact, imgtool, ncs_dir, signing_fingerprint
        )
        _assert_private_key_not_embedded(
            (merged_artifact, ota_artifact),
            (encrypted_signing_key, signing_key),
        )

        head = subprocess.check_output(
            ["git", "-C", str(REPOSITORY_DIR), "rev-parse", "HEAD"], text=True
        ).strip()
        branch = subprocess.check_output(
            ["git", "-C", str(REPOSITORY_DIR), "branch", "--show-current"], text=True
        ).strip()
        source_dirty = bool(subprocess.check_output(
            ["git", "-C", str(REPOSITORY_DIR), "status", "--porcelain", "--untracked-files=all"],
            text=True,
        ).strip())
        west_version = subprocess.check_output([west, "--version"], text=True).strip()
        manifest = {
            "release_id": args.release_id,
            "version": release["version"],
            "version_string": release["version_string"],
            "hardware_ids": [HARDWARE_ID],
            "schedule": release["schedule"],
            "device_credentials_embedded": False,
            "source_commit": head,
            "source_branch": branch,
            "source_worktree_dirty": source_dirty,
            "build_source_sha256": _build_source_sha256(REPOSITORY_DIR, APPLICATION_DIR),
            "build_source_inventory": "git-tracked+explicit-development-v1",
            "build_source_files": [
                path.relative_to(REPOSITORY_DIR).as_posix()
                for path in _build_source_files(REPOSITORY_DIR, APPLICATION_DIR)
            ],
            "ncs_version": NCS_VERSION,
            "toolchain_bundle": toolchain_dir.name,
            "west_version": west_version,
            "board": BOARD,
            "application_configuration": APPLICATION_CONFIGURATION,
            "build_configuration_file": config_path.name,
            "build_command": [
                part.replace(str(signing_key), "<temporary-unlocked-signing-key>")
                .replace(str(encrypted_signing_key), "<external-signing-key>")
                for part in command
            ],
            "generated_partition_layout": partition_layout,
            "generated_image_capacity": image_capacity,
            "generated_boot_configuration": _redact_signing_paths(boot_config),
            "signing": {
                "algorithm": "ECDSA-P256",
                "fingerprint": signing_fingerprint,
                "fingerprint_algorithm": (
                    "SHA-256 of MCUboot DER-encoded SubjectPublicKeyInfo public key"
                ),
                "private_key_in_artifacts": False,
            },
            "generated_mcuboot_public_key_fingerprint": generated_public_fingerprint,
            "generated_protected_storage_configuration": protected_storage_configuration,
            "generated_ota_configuration": ota_configuration,
            "generated_partition_device_tree": _generated_partition_device_tree(build_dir),
            "merged_artifact_file": merged_name,
            "merged_size_bytes": merged_artifact.stat().st_size,
            "merged_sha256": _sha256_file(merged_artifact),
            "artifact_file": ota_name,
            "size_bytes": ota_artifact.stat().st_size,
            "sha256": _sha256_file(ota_artifact),
        }
        manifest_path = output_dir / f"{args.release_id}-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        _protect_tree(output_dir)

        shutil.rmtree(build_dir)
        _protect_tree(output_dir)
        print(f"Built and verified credential-free {args.release_id}: {ota_artifact}")
        print(f"USB commissioning image: {merged_artifact}")
        print(f"Manifest: {manifest_path}")
        print(f"MCUboot image SHA-256: {manifest['sha256']}")
        print("MCUboot signature verified with the generated signing key.")
        return manifest_path
    finally:
        _protect_tree(output_dir)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-id", required=True, choices=RELEASES)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--ncs-install-dir", required=True, type=Path)
    parser.add_argument("--signing-key", required=True, type=Path)
    args = parser.parse_args()
    try:
        with _cleanup_on_termination_signals():
            build_release(args)
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"OTA release build failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
