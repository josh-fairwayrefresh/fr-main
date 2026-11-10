#!/usr/bin/env python3
"""Build and verify a protected, device-specific Fairway firmware image."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys


BOARD = "circuitdojo_feather_nrf9151@1/nrf9151/ns"
APPLICATION_CONFIGURATION = "prj_a.conf"
ACCEPTED_FIRMWARE_SOURCE = "6a19f83c5bd5d1d390efd937daa1c38c0e837eb0"
REPOSITORY_DIR = Path(__file__).resolve().parents[1]
APPLICATION_SOURCE_DIR = REPOSITORY_DIR / "samples" / "fairway_power_sandbox"
DEVICE_ID_RE = re.compile(r"^FRB-[0-9]{4}$")
DEVICE_ID_DEFINITION_RE = re.compile(
    r"^[ \t]*#[ \t]*define[ \t]+FAIRWAY_DEVICE_ID(?:[ \t]|$).*$",
    re.MULTILINE,
)
DEVICE_ID_VALUE_RE = re.compile(
    r'^#define FAIRWAY_DEVICE_ID "([^"]+)"$', re.MULTILINE
)
DEVICE_KEY_DEFINITION_RE = re.compile(
    r"^[ \t]*#[ \t]*define[ \t]+FAIRWAY_DEVICE_KEY(?:[ \t]|$).*$",
    re.MULTILINE,
)
DEVICE_KEY_VALUE_RE = re.compile(
    r'^#define FAIRWAY_DEVICE_KEY "([^"]*)"$', re.MULTILINE
)
PLACEHOLDER_KEY = "replace-with-device-credential"
REQUIRED_MANIFEST_FIELDS = {
    "device_id",
    "provisioning_input_file",
    "accepted_firmware_source",
    "source_commit",
    "source_branch",
    "source_worktree_dirty",
    "build_source_sha256",
    "ncs_version",
    "toolchain_bundle",
    "west_version",
    "board",
    "application_configuration",
    "build_command",
    "credential_embedded",
    "artifact_file",
    "size_bytes",
    "sha256",
}


def _require_private_regular_file(path: Path, description: str = "provisioning input") -> None:
    try:
        file_stat = path.lstat()
    except OSError as exc:
        raise ValueError(f"{description} is unavailable") from exc
    if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
        raise ValueError(f"{description} must be a regular file, not a symlink")
    if os.name != "nt" and stat.S_IMODE(file_stat.st_mode) & 0o077:
        raise ValueError(f"{description} permissions must exclude group and other access")


def _parse_device_input(contents: str, device_id: str) -> str:
    identities = DEVICE_ID_DEFINITION_RE.findall(contents)
    credentials = DEVICE_KEY_DEFINITION_RE.findall(contents)
    if len(identities) != 1:
        raise ValueError("provisioning input must define exactly one Device ID")
    identity_values = DEVICE_ID_VALUE_RE.findall(contents)
    if identity_values != [device_id]:
        raise ValueError("provisioning input identity does not match the requested Device")
    if len(credentials) != 1:
        raise ValueError("provisioning input must define exactly one credential")
    credential_values = DEVICE_KEY_VALUE_RE.findall(contents)
    if len(credential_values) != 1:
        raise ValueError("provisioning input credential has an invalid format")

    credential = credential_values[0]
    if credential == PLACEHOLDER_KEY:
        raise ValueError("provisioning input must not use the placeholder credential")
    if len(credential) != 43 or re.fullmatch(r"[A-Za-z0-9_-]{43}", credential) is None:
        raise ValueError("provisioning input credential has an invalid format")
    try:
        decoded = base64.urlsafe_b64decode(f"{credential}=")
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("provisioning input credential has an invalid format") from exc
    if len(decoded) != 32 or base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != credential:
        raise ValueError("provisioning input credential has an invalid format")
    return credential


def resolve_device_input(
    device_id: str,
    secrets_dir: Path,
    input_file: Path | None = None,
) -> Path:
    if not isinstance(device_id, str) or not DEVICE_ID_RE.fullmatch(device_id):
        raise ValueError("target Device ID must have the form FRB-XXXX")
    if not secrets_dir.is_absolute() or secrets_dir.is_symlink():
        raise ValueError("secrets directory must be an absolute, non-symlink path")
    try:
        resolved_secrets_dir = secrets_dir.resolve(strict=True)
        directory_stat = resolved_secrets_dir.stat()
    except OSError as exc:
        raise ValueError("secrets directory is unavailable") from exc
    if not stat.S_ISDIR(directory_stat.st_mode):
        raise ValueError("secrets path must be a directory")
    if os.name != "nt" and stat.S_IMODE(directory_stat.st_mode) & 0o022:
        raise ValueError("secrets directory must not be group- or world-writable")

    named = resolved_secrets_dir / f"{device_id}-fairway_device_key.h"
    generic = resolved_secrets_dir / "fairway_device_key.h"
    if input_file is None:
        selected = named
    else:
        if not input_file.is_absolute() or input_file.is_symlink():
            raise ValueError("explicit provisioning input must be an absolute, non-symlink path")
        try:
            resolved_input = input_file.resolve(strict=True)
        except OSError as exc:
            raise ValueError("provisioning input is unavailable") from exc
        if resolved_input not in (named, generic):
            raise ValueError("explicit provisioning input must be the target Device header or generic header")
        if resolved_input == generic and named.exists():
            raise ValueError("ambiguous provisioning inputs exist for the requested Device")
        selected = resolved_input
    _require_private_regular_file(selected)
    try:
        contents = selected.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError("provisioning input could not be read") from exc
    _parse_device_input(contents, device_id)
    return selected


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


OTA_DEVELOPMENT_SOURCE_FILES = frozenset(
    f"samples/fairway_power_sandbox/src/{name}"
    for name in (
        "device_identity.c", "device_identity.h",
        "ota_delivery.c", "ota_delivery.h", "ota_delivery_reporting.c",
        "ota_update_discovery.c", "ota_update_discovery.h",
        "ota_update_download.c", "ota_update_download.h",
        "ota_update_reporting.c", "ota_update_reporting.h",
        "ota_update_scheduler.c", "ota_update_scheduler.h",
    )
)


def _is_build_source_path(path: Path) -> bool:
    return (
        not any(part in ("secrets", "artifacts", "__pycache__")
                or part.startswith("build") for part in path.parts)
        and path.suffix.lower() not in (
            ".hex", ".bin", ".elf", ".o", ".a", ".map", ".pyc", ".log",
        )
    )


def _build_source_files(repo_dir: Path, app_dir: Path) -> list[Path]:
    repo_dir = repo_dir.resolve(strict=True)
    roots = (app_dir.resolve(strict=True).relative_to(repo_dir).as_posix(), "boards")

    def git_files(*options: str) -> set[str]:
        try:
            result = subprocess.run(
                ["git", "-C", str(repo_dir), "ls-files", "-z", *options, "--", *roots],
                capture_output=True, check=True,
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            raise ValueError("could not inventory firmware source with Git") from exc
        return {os.fsdecode(name) for name in result.stdout.split(b"\0") if name}

    tracked = git_files("--cached")
    untracked = git_files("--others", "--exclude-standard")
    unexpected = sorted(
        name for name in untracked
        if _is_build_source_path(Path(name)) and name not in OTA_DEVELOPMENT_SOURCE_FILES
    )
    if unexpected:
        raise ValueError("unregistered firmware development inputs: " + ", ".join(unexpected))
    selected = tracked | (untracked & OTA_DEVELOPMENT_SOURCE_FILES)
    files = []
    for relative in sorted(Path(name) for name in selected):
        name = relative.as_posix()
        if not _is_build_source_path(relative):
            continue
        path = repo_dir / relative
        if path.is_symlink() or any(parent.is_symlink() for parent in path.parents
                                    if parent != repo_dir and repo_dir in parent.parents):
            raise ValueError(f"firmware source must not be a symlink: {name}")
        if not path.is_file():
            raise ValueError(f"required firmware source is missing: {name}")
        files.append(path)
    if not files:
        raise ValueError("firmware source inventory is empty")
    return files


def _build_source_sha256(repo_dir: Path, app_dir: Path) -> str:
    repo_dir = repo_dir.resolve(strict=True)
    digest = hashlib.sha256()
    for path in _build_source_files(repo_dir, app_dir):
        relative = path.relative_to(repo_dir).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


def _generated_partition_layout(build_dir: Path) -> dict[str, dict[str, int]]:
    reports = sorted(build_dir.rglob("partitions.yml"))
    if len(reports) != 1:
        raise ValueError(
            f"expected one generated Partition Manager report, found {len(reports)}"
        )

    layout: dict[str, dict[str, int]] = {}
    current_name = None
    for line in reports[0].read_text(encoding="utf-8").splitlines():
        if line and not line[0].isspace() and line.endswith(":"):
            current_name = line[:-1]
            layout[current_name] = {}
            continue
        if current_name is None:
            continue
        match = re.fullmatch(
            r"\s+(address|size|end_address):\s+(0x[0-9a-fA-F]+|\d+)", line
        )
        if match:
            layout[current_name][match.group(1)] = int(match.group(2), 0)

    required = ("mcuboot_primary", "mcuboot_secondary")
    if any(
        name not in layout or not {"address", "size"} <= layout[name].keys()
        for name in required
    ):
        raise ValueError("generated partition report is missing MCUboot image slots")
    return {
        name: values
        for name, values in layout.items()
        if {"address", "size"} <= values.keys()
    }


def _generated_boot_configuration(build_dir: Path) -> dict[str, dict[str, str]]:
    tracked_options = {
        "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256",
        "CONFIG_BOOT_SIGNATURE_TYPE_ED25519",
        "CONFIG_BOOT_SIGNATURE_TYPE_NONE",
        "CONFIG_BOOT_SIGNATURE_TYPE_RSA",
        "CONFIG_BOOT_SIGNATURE_KEY_FILE",
        "CONFIG_BOOT_SWAP_USING_MOVE",
        "CONFIG_BOOT_MAX_IMG_SECTORS",
        "CONFIG_BOOT_SWAP_USING_OFFSET",
        "CONFIG_MCUBOOT",
        "CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION",
        "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE",
        "CONFIG_MCUBOOT_BOOTLOADER_MODE_SWAP_USING_MOVE",
        "CONFIG_MCUBOOT_BOOTLOADER_MODE_SWAP_USING_OFFSET",
    }
    configurations = {}
    for path in sorted(build_dir.rglob(".config")):
        selected = {}
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("CONFIG_") and "=" in line:
                name, value = line.split("=", 1)
                if name in tracked_options:
                    selected[name] = value.strip('"')
        if selected:
            key = path.parent.relative_to(build_dir).as_posix() or "."
            configurations[key] = selected
    if not configurations:
        raise ValueError("build did not produce bootloader and image configuration evidence")
    return configurations


def _ncs_imgtool(ncs_install_dir: Path) -> Path:
    ncs_dir = ncs_install_dir.resolve(strict=True)
    version_file = ncs_dir / "nrf" / "VERSION"
    if not version_file.is_file() or version_file.read_text(encoding="utf-8").strip() != "3.1.1":
        raise ValueError("NCS_INSTALL_DIR must be the installed nRF Connect SDK v3.1.1")
    imgtool = ncs_dir / "bootloader" / "mcuboot" / "scripts" / "imgtool.py"
    if imgtool.is_symlink() or not imgtool.is_file():
        raise ValueError("NCS 3.1.1 MCUboot imgtool.py is unavailable")
    return imgtool


def _west_topdir(west: str, working_dir: Path) -> Path:
    try:
        result = subprocess.run(
            [west, "topdir"],
            cwd=working_dir,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError("could not determine the NCS West workspace top directory") from exc
    topdir = Path(result.stdout.strip())
    if not topdir.is_absolute() or not topdir.is_dir():
        raise ValueError("NCS West workspace top directory is invalid")
    return topdir.resolve()


def _resolve_signing_key(key_value: str, app_config_dir: Path, west_topdir: Path | None) -> Path:
    if not key_value:
        raise ValueError("generated MCUboot signing configuration has no key file")
    configured_path = Path(key_value)
    candidates = (
        [configured_path]
        if configured_path.is_absolute()
        else [
            app_config_dir / configured_path,
            *([west_topdir / configured_path] if west_topdir is not None else []),
        ]
    )
    for candidate in candidates:
        try:
            resolved = candidate.resolve(strict=True)
        except FileNotFoundError:
            continue
        except OSError:
            continue
        if not resolved.is_file():
            raise ValueError("configured MCUboot signing key is not a regular file")
        try:
            with resolved.open("rb"):
                pass
        except OSError as exc:
            raise ValueError("configured MCUboot signing key is inaccessible") from exc
        return resolved
    raise ValueError("configured MCUboot signing key is missing or inaccessible")


def _configured_ota_signing_key(
    generated_configuration: object,
    app_config_dir: Path,
    west_topdir: Path | None,
    ncs_dir: Path,
) -> Path:
    if not isinstance(generated_configuration, dict):
        raise ValueError("generated signing configuration is missing from the OTA manifest")

    app_key_configs = [
        config
        for config in generated_configuration.values()
        if isinstance(config, dict) and "CONFIG_MCUBOOT_SIGNATURE_KEY_FILE" in config
    ]
    boot_key_configs = [
        config
        for config in generated_configuration.values()
        if isinstance(config, dict) and "CONFIG_BOOT_SIGNATURE_KEY_FILE" in config
    ]
    if len(app_key_configs) != 1 or len(boot_key_configs) != 1:
        raise ValueError(
            "generated application and MCUboot signing configurations are required"
        )

    app_key_value = app_key_configs[0]["CONFIG_MCUBOOT_SIGNATURE_KEY_FILE"]
    boot_config = boot_key_configs[0]
    boot_key_value = boot_config["CONFIG_BOOT_SIGNATURE_KEY_FILE"]
    if not isinstance(app_key_value, str) or not isinstance(boot_key_value, str):
        raise ValueError("generated application and MCUboot signing key paths are invalid")
    enabled_types = [
        name
        for name in (
            "CONFIG_BOOT_SIGNATURE_TYPE_ECDSA_P256",
            "CONFIG_BOOT_SIGNATURE_TYPE_ED25519",
            "CONFIG_BOOT_SIGNATURE_TYPE_RSA",
        )
        if boot_config.get(name) == "y"
    ]
    if boot_config.get("CONFIG_BOOT_SIGNATURE_TYPE_NONE") == "y" or len(enabled_types) != 1:
        raise ValueError("generated MCUboot configuration does not select one signature type")

    if app_key_value != boot_key_value:
        raise ValueError("generated application and MCUboot signing keys do not match")
    key_path = Path(app_key_value)
    if (
        west_topdir is None
        and not key_path.is_absolute()
        and not (app_config_dir / key_path).is_file()
    ):
        west = shutil.which("west")
        if west is None:
            raise ValueError("west is required to resolve the generated MCUboot signing key")
        west_topdir = _west_topdir(west, ncs_dir)
    return _resolve_signing_key(app_key_value, app_config_dir, west_topdir)


def _verify_mcuboot_signature(artifact: Path, key: Path, imgtool: Path) -> None:
    command = [
        sys.executable,
        str(imgtool),
        "verify",
        "--key",
        str(key),
        str(artifact),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except OSError as exc:
        raise ValueError("could not execute NCS imgtool for MCUboot signature verification") from exc
    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        message = f"MCUboot signature verification failed for {artifact.name}"
        if details:
            message = f"{message}: {details}"
        raise ValueError(message)


def _generated_partition_device_tree(build_dir: Path) -> dict[str, object]:
    candidates = [
        path
        for path in sorted(build_dir.rglob("zephyr.dts"))
        if "fairway_power_sandbox" in path.relative_to(build_dir).parts
    ]
    if len(candidates) != 1:
        raise ValueError(
            f"expected one generated application devicetree, found {len(candidates)}"
        )

    text = candidates[0].read_text(encoding="utf-8", errors="replace")
    partition_blocks = re.findall(
        r"(?m)^\s*(?:[A-Za-z_][A-Za-z0-9_]*:\s*)?partition@[^{]+\{.*?^\s*\};",
        text,
        re.DOTALL,
    )
    labels = {
        "mcuboot",
        "image-0",
        "image-0-nonsecure",
        "image-1",
        "image-1-nonsecure",
        "storage",
    }
    relevant = [
        block.strip()
        for block in partition_blocks
        if any(f'label = "{label}";' in block for label in labels)
    ]
    if not relevant:
        raise ValueError("generated application devicetree has no MCUboot partition nodes")
    return {
        "file": candidates[0].relative_to(build_dir).as_posix(),
        "sha256": _sha256_file(candidates[0]),
        "partitions": relevant,
    }


def _intel_hex_runs(artifact: Path) -> list[tuple[int, bytes]]:
    records = []
    address_base = 0
    eof_seen = False
    try:
        lines = artifact.read_text(encoding="ascii").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ValueError("firmware artifact is not a readable Intel HEX file") from exc

    for line in lines:
        if not line:
            continue
        if eof_seen or re.fullmatch(r":[0-9A-Fa-f]+", line) is None:
            raise ValueError("firmware artifact contains an invalid Intel HEX record")
        try:
            record = bytes.fromhex(line[1:])
        except ValueError as exc:
            raise ValueError("firmware artifact contains an invalid Intel HEX record") from exc
        if len(record) < 5 or len(record) != record[0] + 5 or sum(record) & 0xFF:
            raise ValueError("firmware artifact contains an invalid Intel HEX checksum")
        count = record[0]
        offset = int.from_bytes(record[1:3], "big")
        record_type = record[3]
        data = record[4 : 4 + count]
        if record_type == 0x00:
            records.append((address_base + offset, data))
        elif record_type == 0x01:
            if count != 0:
                raise ValueError("firmware artifact contains an invalid Intel HEX EOF record")
            eof_seen = True
        elif record_type == 0x02:
            if count != 2:
                raise ValueError("firmware artifact contains an invalid Intel HEX segment record")
            address_base = int.from_bytes(data, "big") << 4
        elif record_type == 0x04:
            if count != 2:
                raise ValueError("firmware artifact contains an invalid Intel HEX linear address record")
            address_base = int.from_bytes(data, "big") << 16
        elif record_type not in (0x03, 0x05):
            raise ValueError("firmware artifact contains an unsupported Intel HEX record")

    if not eof_seen:
        raise ValueError("firmware artifact is missing the Intel HEX EOF record")
    records.sort(key=lambda item: item[0])
    runs: list[tuple[int, bytes]] = []
    for start, data in records:
        if not data:
            continue
        if runs and start <= runs[-1][0] + len(runs[-1][1]):
            previous_start, previous_data = runs[-1]
            overlap = previous_start + len(previous_data) - start
            if overlap > 0:
                if previous_data[-overlap:] != data[:overlap]:
                    raise ValueError("firmware artifact contains conflicting Intel HEX data")
                data = data[overlap:]
                start += overlap
            if start == previous_start + len(previous_data):
                runs[-1] = (previous_start, previous_data + data)
                continue
        runs.append((start, data))
    return runs


def _verify_embedded_inputs(artifact: Path, device_id: str, credential: str) -> None:
    identity_bytes = device_id.encode("ascii")
    credential_bytes = credential.encode("ascii")
    identity_found = False
    credential_found = False
    for _, data in _intel_hex_runs(artifact):
        identity_found = identity_found or identity_bytes in data
        credential_found = credential_found or credential_bytes in data
    if not identity_found or not credential_found:
        raise ValueError("firmware artifact does not contain the selected Device identity and credential")


def _verify_ota_image_inputs(artifact: Path, device_id: str, credential: str) -> None:
    image = artifact.read_bytes()
    if not image.startswith(bytes((0x3D, 0xB8, 0xF3, 0x96))):
        raise ValueError("OTA artifact does not begin with a MCUboot image header")
    if device_id.encode("ascii") not in image or credential.encode("ascii") not in image:
        raise ValueError("OTA artifact does not contain the selected Device identity and credential")


def _protect_tree(root: Path) -> None:
    if os.name == "nt" or not root.exists():
        return
    for path in root.rglob("*"):
        if path.is_symlink():
            continue
        current_mode = stat.S_IMODE(path.stat().st_mode)
        if path.is_dir():
            path.chmod(current_mode & ~0o077 | 0o700)
        elif path.is_file():
            path.chmod(current_mode & ~0o077)
    root.chmod(0o700)


def verify_artifact(
    artifact: Path,
    manifest_path: Path,
    expected_device_id: str,
    secrets_dir: Path,
    input_file: Path | None = None,
    ota_artifact: Path | None = None,
    ncs_install_dir: Path | None = None,
    west_topdir: Path | None = None,
) -> dict:
    signature_verification: tuple[Path, Path, Path] | None = None
    if not isinstance(expected_device_id, str) or not DEVICE_ID_RE.fullmatch(expected_device_id):
        raise ValueError("target Device ID must have the form FRB-XXXX")
    if artifact.is_symlink() or manifest_path.is_symlink():
        raise ValueError("artifact and manifest must not be symlinks")
    if not artifact.is_file() or not manifest_path.is_file():
        raise ValueError("artifact and manifest must be regular files")
    _require_private_regular_file(artifact, "firmware artifact")
    _require_private_regular_file(manifest_path, "artifact manifest")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("artifact manifest could not be read") from exc
    if not isinstance(manifest, dict) or not REQUIRED_MANIFEST_FIELDS.issubset(manifest):
        raise ValueError("artifact manifest is incomplete")
    if (
        not isinstance(manifest["artifact_file"], str)
        or not isinstance(manifest["provisioning_input_file"], str)
        or not isinstance(manifest["size_bytes"], int)
        or isinstance(manifest["size_bytes"], bool)
        or manifest["size_bytes"] <= 0
        or not isinstance(manifest["sha256"], str)
        or re.fullmatch(r"[0-9a-f]{64}", manifest["sha256"]) is None
        or not isinstance(manifest["source_commit"], str)
        or re.fullmatch(r"[0-9a-f]{40,64}", manifest["source_commit"]) is None
        or not isinstance(manifest.get("build_source_sha256"), str)
        or re.fullmatch(r"[0-9a-f]{64}", manifest["build_source_sha256"]) is None
        or not isinstance(manifest["source_branch"], str)
        or not isinstance(manifest["source_worktree_dirty"], bool)
        or not isinstance(manifest["toolchain_bundle"], str)
        or not isinstance(manifest["west_version"], str)
        or not isinstance(manifest["build_command"], list)
        or not all(isinstance(argument, str) for argument in manifest["build_command"])
    ):
        raise ValueError("artifact manifest contains invalid metadata")
    if manifest["device_id"] != expected_device_id:
        raise ValueError("artifact manifest is for a different Device")
    if (
        manifest["artifact_file"] != artifact.name
        or Path(manifest["artifact_file"]).name != manifest["artifact_file"]
    ):
        raise ValueError("artifact filename does not match the manifest")
    selected_header = resolve_device_input(expected_device_id, secrets_dir, input_file)
    if manifest["provisioning_input_file"] != selected_header.name:
        raise ValueError("artifact manifest identifies a different provisioning input")
    if (
        manifest["accepted_firmware_source"] != ACCEPTED_FIRMWARE_SOURCE
        or manifest["ncs_version"] != "3.1.1"
        or manifest["board"] != BOARD
        or manifest["application_configuration"] != APPLICATION_CONFIGURATION
        or manifest["credential_embedded"] is not True
    ):
        raise ValueError("artifact manifest build configuration is incompatible")
    if artifact.stat().st_size != manifest["size_bytes"]:
        raise ValueError("firmware artifact size does not match the manifest")
    if _sha256_file(artifact) != manifest["sha256"]:
        raise ValueError("firmware artifact SHA-256 does not match the manifest")

    ota_fields = {"ota_artifact_file", "ota_size_bytes", "ota_sha256"}
    if ota_artifact is not None and not ota_fields.issubset(manifest):
        raise ValueError("OTA image metadata is required for OTA artifact verification")
    if ota_fields.intersection(manifest):
        if not ota_fields.issubset(manifest):
            raise ValueError("OTA image metadata is incomplete")
        if (
            not isinstance(manifest["ota_artifact_file"], str)
            or Path(manifest["ota_artifact_file"]).name != manifest["ota_artifact_file"]
        ):
            raise ValueError("OTA image metadata is invalid or does not match the manifest")
        if ota_artifact is None:
            ota_artifact = manifest_path.parent / manifest["ota_artifact_file"]
        if ota_artifact.is_symlink() or not ota_artifact.is_file():
            raise ValueError("OTA image artifact must be a regular file, not a symlink")
        _require_private_regular_file(ota_artifact, "OTA image artifact")
        if (
            not isinstance(manifest["ota_artifact_file"], str)
            or manifest["ota_artifact_file"] != ota_artifact.name
            or Path(manifest["ota_artifact_file"]).name != manifest["ota_artifact_file"]
            or not isinstance(manifest["ota_size_bytes"], int)
            or isinstance(manifest["ota_size_bytes"], bool)
            or manifest["ota_size_bytes"] <= 0
            or not isinstance(manifest["ota_sha256"], str)
            or re.fullmatch(r"[0-9a-f]{64}", manifest["ota_sha256"]) is None
        ):
            raise ValueError("OTA image metadata is invalid or does not match the manifest")
        if ota_artifact.stat().st_size != manifest["ota_size_bytes"]:
            raise ValueError("OTA image size does not match the manifest")
        if _sha256_file(ota_artifact) != manifest["ota_sha256"]:
            raise ValueError("OTA image SHA-256 does not match the manifest")
        if ncs_install_dir is None:
            raise ValueError("NCS_INSTALL_DIR is required to verify an OTA image signature")
        ncs_dir = ncs_install_dir.resolve(strict=True)
        imgtool = _ncs_imgtool(ncs_dir)
        signing_key = _configured_ota_signing_key(
            manifest.get("generated_boot_configuration"),
            APPLICATION_SOURCE_DIR,
            west_topdir,
            ncs_dir,
        )
        signature_verification = (ota_artifact, signing_key, imgtool)

    try:
        credential = _parse_device_input(
            selected_header.read_text(encoding="utf-8"), expected_device_id
        )
    except (OSError, UnicodeError) as exc:
        raise ValueError("provisioning input could not be read") from exc
    _verify_embedded_inputs(artifact, expected_device_id, credential)
    if ota_artifact is not None:
        _verify_ota_image_inputs(ota_artifact, expected_device_id, credential)
    if signature_verification is not None:
        _verify_mcuboot_signature(*signature_verification)
    return manifest


def _validate_output_path(output_dir: Path, repo_dir: Path, secrets_dir: Path) -> Path:
    if output_dir.exists() or output_dir.is_symlink():
        raise ValueError("output directory must not exist; choose a fresh path")
    resolved = output_dir.resolve()
    if resolved == repo_dir or repo_dir in resolved.parents:
        raise ValueError("output directory must be outside the source checkout")
    if resolved == secrets_dir or secrets_dir in resolved.parents:
        raise ValueError("output directory must be outside the provisioning secrets directory")
    return resolved


def build(args: argparse.Namespace) -> None:
    device_id = args.device_id
    secrets_dir = args.secrets_dir
    selected_header = resolve_device_input(device_id, secrets_dir, args.input_file)
    ncs_dir = args.ncs_install_dir.resolve(strict=True)
    toolchain_value = os.environ.get("NCS_TOOLCHAIN_DIR")
    if not toolchain_value:
        raise ValueError("NCS_TOOLCHAIN_DIR must identify the matching Nordic toolchain bundle")
    toolchain_dir = Path(toolchain_value).resolve(strict=True)
    version_file = ncs_dir / "nrf" / "VERSION"
    if not version_file.is_file() or version_file.read_text(encoding="utf-8").strip() != "3.1.1":
        raise ValueError("NCS_INSTALL_DIR must be the installed nRF Connect SDK v3.1.1")
    west = shutil.which("west")
    compiler = (
        toolchain_dir
        / "opt"
        / "zephyr-sdk"
        / "arm-zephyr-eabi"
        / "bin"
        / "arm-zephyr-eabi-gcc"
    )
    if not west or not compiler.is_file():
        raise ValueError("matching Nordic West and ARM compiler must be available in the environment")
    west_path = Path(west).resolve()
    if toolchain_dir not in west_path.parents:
        raise ValueError("west must resolve from the selected Nordic toolchain bundle")
    west_topdir = _west_topdir(west, ncs_dir)

    repo_dir = Path(__file__).resolve().parents[1]
    app_dir = repo_dir / "samples" / "fairway_power_sandbox"
    output_dir = _validate_output_path(args.output_dir, repo_dir, secrets_dir.resolve(strict=True))
    head = subprocess.check_output(
        ["git", "-C", str(repo_dir), "rev-parse", "HEAD"], text=True
    ).strip()
    branch = subprocess.check_output(
        ["git", "-C", str(repo_dir), "branch", "--show-current"], text=True
    ).strip()
    source_dirty = bool(
        subprocess.check_output(
            ["git", "-C", str(repo_dir), "status", "--porcelain", "--untracked-files=all"],
            text=True,
        ).strip()
    )
    build_source_sha256 = _build_source_sha256(repo_dir, app_dir)

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    old_umask = os.umask(0o077)
    try:
        output_dir.mkdir(mode=0o700)
    finally:
        os.umask(old_umask)
    build_dir = output_dir / "build"

    env = os.environ.copy()
    env["ZEPHYR_TOOLCHAIN_VARIANT"] = "zephyr"
    env["ZEPHYR_SDK_INSTALL_DIR"] = str(toolchain_dir / "opt" / "zephyr-sdk")
    env["FAIRWAY_DEVICE_ID"] = device_id
    env["FAIRWAY_DEVICE_SECRETS_DIR"] = str(secrets_dir.resolve(strict=True))
    env["FAIRWAY_DEVICE_KEY_HEADER"] = str(selected_header)
    command = [
        west,
        "build",
        "--build-dir",
        str(build_dir),
        "--pristine=always",
        str(app_dir),
        "--board",
        BOARD,
        "--",
        f"-DBOARD_ROOT={repo_dir}",
        "-DEXTRA_CONF_FILE=prj_a.conf",
        "-DDEBUG_THREAD_INFO=On",
        "-DCONFIG_DEBUG_THREAD_INFO=y",
        "-Dfairway_power_sandbox_DEBUG_THREAD_INFO=On",
        "-Dmcuboot_DEBUG_THREAD_INFO=Off",
        f"-DFAIRWAY_DEVICE_ID={device_id}",
        f"-DFAIRWAY_DEVICE_SECRETS_DIR={secrets_dir.resolve(strict=True)}",
        f"-DFAIRWAY_DEVICE_KEY_HEADER={selected_header}",
    ]
    try:
        subprocess.run(command, cwd=ncs_dir, env=env, check=True)
        merged_hex = build_dir / "merged.hex"
        if not merged_hex.is_file():
            raise ValueError("successful build did not produce merged.hex")
        config_files = list(build_dir.rglob(".config"))
        if not config_files:
            raise ValueError("build did not produce a Kconfig configuration")
        if any(
            "CONFIG_FAIRWAY_TRUST_RESILIENCE_EXPERIMENTS=y" in path.read_text(
                encoding="utf-8", errors="replace"
            )
            for path in config_files
        ):
            raise ValueError("build unexpectedly enables experimental trust-resilience components")
        generated_partition_layout = _generated_partition_layout(build_dir)
        generated_boot_configuration = _generated_boot_configuration(build_dir)
        generated_partition_device_tree = _generated_partition_device_tree(build_dir)

        artifact_name = f"fairway-{device_id}-merged.hex"
        artifact = output_dir / artifact_name
        if artifact.exists():
            raise ValueError("verified firmware artifact already exists; refusing to overwrite")
        shutil.copyfile(merged_hex, artifact)
        ota_image = build_dir / "fairway_power_sandbox" / "zephyr" / "zephyr.signed.bin"
        if ota_image.is_symlink() or not ota_image.is_file():
            raise ValueError("successful build did not produce the signed MCUboot OTA image")
        ota_artifact = output_dir / f"fairway-{device_id}-ota.signed.bin"
        if ota_artifact.exists():
            raise ValueError("OTA image artifact already exists; refusing to overwrite")
        shutil.copyfile(ota_image, ota_artifact)
        _protect_tree(output_dir)
        credential = _parse_device_input(
            selected_header.read_text(encoding="utf-8"), device_id
        )
        _verify_embedded_inputs(
            artifact,
            device_id,
            credential,
        )
        _verify_ota_image_inputs(ota_artifact, device_id, credential)
        digest = _sha256_file(artifact)
        size_bytes = artifact.stat().st_size
        ota_digest = _sha256_file(ota_artifact)
        ota_size_bytes = ota_artifact.stat().st_size
        west_version = subprocess.check_output([west, "--version"], text=True).strip()
        manifest = {
            "device_id": device_id,
            "provisioning_input_file": selected_header.name,
            "accepted_firmware_source": ACCEPTED_FIRMWARE_SOURCE,
            "source_commit": head,
            "source_branch": branch,
            "source_worktree_dirty": source_dirty,
            "build_source_sha256": build_source_sha256,
            "ncs_version": "3.1.1",
            "toolchain_bundle": toolchain_dir.name,
            "west_version": west_version,
            "board": BOARD,
            "application_configuration": APPLICATION_CONFIGURATION,
            "build_command": command,
            "generated_partition_layout": generated_partition_layout,
            "generated_boot_configuration": generated_boot_configuration,
            "generated_partition_device_tree": generated_partition_device_tree,
            "credential_embedded": True,
            "artifact_file": artifact_name,
            "size_bytes": size_bytes,
            "sha256": digest,
            "ota_artifact_file": ota_artifact.name,
            "ota_size_bytes": ota_size_bytes,
            "ota_sha256": ota_digest,
        }
        manifest_path = output_dir / f"fairway-{device_id}-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        checksum_path = output_dir / f"{artifact_name}.sha256"
        checksum_path.write_text(f"{digest}  {artifact_name}\n", encoding="ascii")
        ota_checksum_path = output_dir / f"{ota_artifact.name}.sha256"
        ota_checksum_path.write_text(
            f"{ota_digest}  {ota_artifact.name}\n", encoding="ascii"
        )
        _protect_tree(output_dir)
        verify_artifact(
            artifact,
            manifest_path,
            device_id,
            secrets_dir,
            args.input_file,
            ota_artifact,
            ncs_dir,
            west_topdir,
        )
        shutil.rmtree(build_dir)
        _protect_tree(output_dir)
        print(f"Built and verified {device_id}: {artifact}")
        print(f"Manifest: {manifest_path}")
        print(f"Artifact SHA-256: {digest}")
        print(f"Signed OTA image: {ota_artifact}")
        print(f"OTA image SHA-256: {ota_digest}")
        print("MCUboot OTA image signature verified with the generated signing key.")
        print("Protected build intermediates were removed after verification.")
    finally:
        _protect_tree(output_dir)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--secrets-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--ncs-install-dir", required=True, type=Path)
    parser.add_argument("--input-file", type=Path)
    args = parser.parse_args()
    try:
        build(args)
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"device firmware build failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
