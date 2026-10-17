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


def _build_source_sha256(repo_dir: Path, app_dir: Path) -> str:
    digest = hashlib.sha256()
    source_files = sorted(
        path
        for root in (app_dir, repo_dir / "boards")
        if root.is_dir()
        for path in root.rglob("*")
        if path.is_file()
        and not path.is_symlink()
        and "secrets" not in path.relative_to(repo_dir).parts
        and not any(part.startswith("build") for part in path.relative_to(repo_dir).parts)
    )
    for path in source_files:
        relative = path.relative_to(repo_dir).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


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
) -> dict:
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

    try:
        credential = _parse_device_input(
            selected_header.read_text(encoding="utf-8"), expected_device_id
        )
    except (OSError, UnicodeError) as exc:
        raise ValueError("provisioning input could not be read") from exc
    _verify_embedded_inputs(artifact, expected_device_id, credential)
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

        artifact_name = f"fairway-{device_id}-merged.hex"
        artifact = output_dir / artifact_name
        if artifact.exists():
            raise ValueError("verified firmware artifact already exists; refusing to overwrite")
        shutil.copyfile(merged_hex, artifact)
        _protect_tree(output_dir)
        _verify_embedded_inputs(
            artifact,
            device_id,
            _parse_device_input(selected_header.read_text(encoding="utf-8"), device_id),
        )
        digest = _sha256_file(artifact)
        size_bytes = artifact.stat().st_size
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
            "credential_embedded": True,
            "artifact_file": artifact_name,
            "size_bytes": size_bytes,
            "sha256": digest,
        }
        manifest_path = output_dir / f"fairway-{device_id}-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        checksum_path = output_dir / f"{artifact_name}.sha256"
        checksum_path.write_text(f"{digest}  {artifact_name}\n", encoding="ascii")
        _protect_tree(output_dir)
        verify_artifact(
            artifact, manifest_path, device_id, secrets_dir, args.input_file
        )
        shutil.rmtree(build_dir)
        _protect_tree(output_dir)
        print(f"Built and verified {device_id}: {artifact}")
        print(f"Manifest: {manifest_path}")
        print(f"Artifact SHA-256: {digest}")
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
