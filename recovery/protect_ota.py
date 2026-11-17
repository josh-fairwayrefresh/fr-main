#!/usr/bin/env python3
"""Recover only accepted, credential-free OTA packages; never read signing secrets."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_device_firmware import _intel_hex_runs


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def policy():
    script = """
const a = require('./fairway_backend/cloudrun_receiver/lib/ota/accepted_releases');
const p = require('./fairway_backend/cloudrun_receiver/lib/ota/publication_policy');
console.log(JSON.stringify({...a, approvals: p.PUBLICATION_APPROVALS}));
"""
    return json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, check=True,
                                     capture_output=True, text=True).stdout)


def artifact(package, manifest, field, hash_field):
    name = manifest[field]
    if not isinstance(name, str) or Path(name).name != name or name in (".", ".."):
        raise ValueError(f"Unsafe artifact filename: {field}")
    path = package / name
    if path.is_symlink() or not path.is_file() or digest(path) != manifest[hash_field]:
        raise ValueError(f"Artifact checksum mismatch: {field}")
    return path


def public_anchor(merged, fingerprint):
    prefix = bytes.fromhex("3059301306072a8648ce3d020106082a8648ce3d030107034200")
    for _, data in _intel_hex_runs(merged):
        offset = data.find(prefix)
        while offset >= 0:
            der = data[offset:offset + 91]
            if "sha256:" + hashlib.sha256(der).hexdigest() == fingerprint:
                body = base64.b64encode(der).decode("ascii")
                return ("-----BEGIN PUBLIC KEY-----\n"
                        + "\n".join(body[i:i + 64] for i in range(0, len(body), 64))
                        + "\n-----END PUBLIC KEY-----\n")
            offset = data.find(prefix, offset + 1)
    raise ValueError("Merged bootloader does not contain the accepted public trust anchor")


def verify_public_signature(binary, key, directory):
    image = binary.read_bytes()
    if len(image) < 32 or struct.unpack_from("<I", image)[0] != 0x96F3B83D:
        raise ValueError("Invalid MCUboot image header")
    header_size, protected_size, image_size = struct.unpack_from("<HHI", image, 8)
    signed_end = header_size + image_size + protected_size
    if header_size < 32 or signed_end + 4 > len(image):
        raise ValueError("Truncated MCUboot image")
    magic, total = struct.unpack_from("<HH", image, signed_end)
    if magic != 0x6907 or total < 4 or signed_end + total > len(image):
        raise ValueError("Invalid MCUboot signature TLVs")
    entries = {}
    offset = signed_end + 4
    while offset < signed_end + total:
        if offset + 4 > signed_end + total:
            raise ValueError("Truncated MCUboot signature TLV")
        kind, length = struct.unpack_from("<HH", image, offset)
        offset += 4
        if offset + length > signed_end + total or kind in entries:
            raise ValueError("Malformed or duplicate MCUboot signature TLV")
        entries[kind] = image[offset:offset + length]
        offset += length
    if entries.get(0x10) != hashlib.sha256(image[:signed_end]).digest():
        raise ValueError("MCUboot image hash mismatch")
    signature = entries.get(0x22, b"")
    if len(signature) < 2 or signature[0] != 0x30 or signature[1] + 2 > len(signature):
        raise ValueError("Missing or invalid MCUboot ECDSA signature")
    signature_path = directory / "signature.der"
    payload_path = directory / "signed-payload.bin"
    signature_path.write_bytes(signature[:signature[1] + 2])
    payload_path.write_bytes(image[:signed_end])
    result = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(key),
                             "-signature", str(signature_path), str(payload_path)],
                            capture_output=True, check=False)
    if result.returncode:
        raise ValueError("MCUboot ECDSA public-key verification failed")


def verify_package(package, release, accepted, fingerprint):
    manifest_path = package / f"{release}-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    canonical = ROOT / "docs/releases" / manifest_path.name
    if canonical.is_file() and manifest != json.loads(canonical.read_text()):
        raise ValueError(f"Package differs from canonical accepted manifest: {release}")
    if (manifest["release_id"] != release or manifest["sha256"] != accepted
            or manifest.get("device_credentials_embedded") is not False
            or manifest["signing"]["fingerprint"] != fingerprint
            or manifest["signing"].get("private_key_in_artifacts") is not False):
        raise ValueError(f"Unaccepted or credential-bearing package: {release}")
    binary = artifact(package, manifest, "artifact_file", "sha256")
    merged = artifact(package, manifest, "merged_artifact_file", "merged_sha256")
    if binary.stat().st_size != manifest["size_bytes"]:
        raise ValueError(f"Artifact size mismatch: {release}")
    with tempfile.TemporaryDirectory(prefix="fairway-public-verification-") as directory:
        key = Path(directory) / "public.pem"
        key.write_text(public_anchor(merged, fingerprint))
        verify_public_signature(binary, key, Path(directory))
    return manifest, [manifest_path, binary, merged]


def recover(source, destination):
    if destination.exists():
        raise ValueError("Recovery destination must not already exist")
    accepted = policy()
    packages = {}
    for release, sha in accepted["ACCEPTED_RELEASES"].items():
        candidates = sorted(source.glob(f"ota-{release}-*/{release}-manifest.json"))
        recovered_manifest = source / release / f"{release}-manifest.json"
        if recovered_manifest.is_file():
            candidates.append(recovered_manifest)
        matched = []
        for manifest_path in candidates:
            manifest = json.loads(manifest_path.read_text())
            if manifest.get("sha256") == sha:
                matched.append(manifest_path.parent)
        if not matched:
            raise ValueError(f"No local exact accepted package: {release}")
        packages[release] = matched[0]
    destination.mkdir(parents=True)
    inventory = {"public_key_fingerprint": accepted["PRODUCTION_FINGERPRINT"],
                 "independent_cloud_protection": "pending_authorization", "releases": {}}
    for release, package in packages.items():
        manifest, files = verify_package(package, release, accepted["ACCEPTED_RELEASES"][release],
                                         accepted["PRODUCTION_FINGERPRINT"])
        target = destination / release
        target.mkdir()
        for path in files:
            shutil.copyfile(path, target / path.name)
        copied, recovered_files = verify_package(target, release,
                                                  accepted["ACCEPTED_RELEASES"][release],
                                                  accepted["PRODUCTION_FINGERPRINT"])
        inventory["releases"][release] = {
            "sha256": copied["sha256"], "source_commit": manifest["source_commit"],
            "build_source_sha256": manifest.get("build_source_sha256"),
            "publication_approval": accepted["approvals"].get(release),
            "canonical_manifest_present": (ROOT / "docs/releases" / f"{release}-manifest.json").is_file(),
            "files": {p.name: digest(p) for p in recovered_files},
            "fresh_signature_verification": True,
        }
    for relative in ("accepted_releases.js", "publication_policy.js"):
        shutil.copyfile(ROOT / "fairway_backend/cloudrun_receiver/lib/ota" / relative,
                        destination / relative)
    (destination / "recovery-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
    return inventory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    result = recover(args.source.resolve(), args.destination.resolve())
    print(f"Recovered and signature-verified {len(result['releases'])} accepted releases.")


if __name__ == "__main__":
    main()
