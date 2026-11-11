#!/usr/bin/env python3
"""Commission a Fairway device over its onboard USB debug and serial interfaces."""

import argparse
import base64
import errno
import fcntl
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import select
import stat
import struct
import subprocess
import sys
import termios
import time
import tty
import uuid
import urllib.error
import urllib.request
import zlib


PACKET_PREFIX = b"FRC1"
DEVICE_ID_LENGTH = 8
DEVICE_KEY_LENGTH = 43
DISCONNECT_ERRORS = {errno.ENXIO, errno.EIO, errno.ENODEV, errno.ENOENT}
ADMIN_ORIGIN = "https://fairway-admin-936892386735.us-central1.run.app"


def valid_device_id(value: str) -> bool:
    return (
        isinstance(value, str)
        and len(value) == DEVICE_ID_LENGTH
        and value.startswith("FRB-")
        and all("0" <= char <= "9" for char in value[4:])
    )


def valid_device_key(value: str) -> bool:
    if not isinstance(value, str) or len(value) != DEVICE_KEY_LENGTH:
        return False
    try:
        decoded = base64.b64decode(value + "=", altchars=b"-_", validate=True)
    except (ValueError, UnicodeEncodeError):
        return False
    return (
        len(decoded) == 32
        and base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") == value
    )


def load_credential_file(
    path: str, expected_device_id: str, expected_operation_id: str
) -> tuple[str, str]:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("credential file must be a regular file")
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError("credential file must be current-user-owned with mode 0600")
        if info.st_size > 4096:
            raise ValueError("credential file is too large")
        with os.fdopen(fd, "r", encoding="utf-8") as source:
            fd = -1
            try:
                data = json.load(source)
            except (ValueError, UnicodeError) as exc:
                raise ValueError("credential file must contain valid JSON") from exc
    finally:
        if fd >= 0:
            os.close(fd)

    if not isinstance(data, dict):
        raise ValueError("credential file must contain an object")
    device_id = data.get("device_id")
    device_key = data.get("one_time_credential")
    operation_id = data.get("operation_id")
    if not valid_device_id(device_id) or device_id != expected_device_id:
        raise ValueError("credential file does not match the expected Device ID")
    if not valid_device_key(device_key):
        raise ValueError("credential file contains an invalid device credential")
    try:
        uuid.UUID(expected_operation_id)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("expected rotation operation ID is invalid") from exc
    if operation_id != expected_operation_id:
        raise ValueError("credential file does not match the expected rotation operation ID")
    return device_id, device_key


def configure_serial(fd: int) -> None:
    tty.setraw(fd, termios.TCSANOW)
    attrs = termios.tcgetattr(fd)
    attrs[4] = attrs[5] = termios.B115200
    attrs[2] &= ~(termios.CSIZE | termios.PARENB | termios.CSTOPB)
    attrs[2] |= termios.CS8 | termios.CLOCAL | termios.CREAD
    if hasattr(termios, "CRTSCTS"):
        attrs[2] &= ~termios.CRTSCTS
    termios.tcsetattr(fd, termios.TCSANOW, attrs)


def _registry_ports(nodes: list, probe_serial: str) -> list[str]:
    ports = []

    def visit(node: dict, matched: bool = False) -> None:
        if node.get("IOObjectClass") == "IOUSBHostDevice":
            matched = (
                node.get("USB Serial Number") == probe_serial
                and node.get("idVendor") == 0x2E8A
                and node.get("idProduct") == 0x000C
            )
        port = node.get("IOCalloutDevice")
        if matched and isinstance(port, str) and port.startswith("/dev/cu.usbmodem"):
            ports.append(port)
        for child in node.get("IORegistryEntryChildren", []):
            visit(child, matched)

    for node in nodes:
        visit(node)
    return sorted(set(ports))


def _discover_probe_port(probe_serial: str) -> str | None:
    if sys.platform != "darwin":
        raise ValueError("probe-serial discovery is supported only on macOS")
    result = subprocess.run(
        ["ioreg", "-a", "-l", "-r", "-c", "IOUSBHostDevice"],
        capture_output=True,
        check=True,
        timeout=5,
    )
    ports = _registry_ports(plistlib.loads(result.stdout), probe_serial)
    if len(ports) > 1:
        raise ValueError("multiple CDC ports belong to the requested probe; refusing to guess")
    return ports[0] if ports else None


class SerialConnection:
    def __init__(self, port: str, probe_serial: str | None = None):
        self.port = port
        self.probe_serial = probe_serial
        self.fd = None

    def close(self) -> None:
        if self.fd is not None:
            fd, self.fd = self.fd, None
            os.close(fd)

    def open(self, deadline: float) -> None:
        while time.monotonic() < deadline:
            port = _discover_probe_port(self.probe_serial) if self.probe_serial else self.port
            if port:
                try:
                    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
                except OSError as exc:
                    if exc.errno not in DISCONNECT_ERRORS:
                        raise
                else:
                    self.fd = fd
                    try:
                        fcntl.ioctl(fd, termios.TIOCEXCL)
                        configure_serial(fd)
                    except (OSError, termios.error) as exc:
                        self.close()
                        if isinstance(exc, OSError) and exc.errno in DISCONNECT_ERRORS:
                            continue
                        raise
                    self.port = port
                    return
            time.sleep(0.05)
        raise TimeoutError("verified USB serial port did not become available")

def send_packet(fd: int, packet: bytearray, deadline: float) -> None:
    sent = 0
    while sent < len(packet):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("USB commissioning write timed out")
        _, writable, _ = select.select([], [fd], [], min(0.25, remaining))
        if not writable:
            continue
        try:
            written = os.write(fd, memoryview(packet)[sent:])
        except BlockingIOError:
            continue
        if written <= 0:
            raise OSError("USB serial driver did not accept commissioning data")
        sent += written


def transaction(connection: SerialConnection, operation: bytes, device_id="", device_key=""):
    if operation not in (b"?", b"P", b"V"):
        raise ValueError("invalid commissioning operation")
    if operation != b"?" and (not valid_device_id(device_id) or not valid_device_key(device_key)):
        raise ValueError("invalid device identity or credential")
    nonce = secrets.token_bytes(16)
    packet = bytearray(PACKET_PREFIX + operation + nonce)
    if operation != b"?":
        packet.extend(device_id.encode("ascii") + device_key.encode("ascii"))
    packet.extend(struct.pack("<I", zlib.crc32(packet)))
    deadline = time.monotonic() + 8
    expected = b"FRC1 " + nonce.hex().encode() + b" "
    received = bytearray()
    try:
        if connection.fd is None:
            raise ConnectionError("serial connection is not open")
        send_packet(connection.fd, packet, deadline)
        while time.monotonic() < deadline:
            readable, _, _ = select.select(
                [connection.fd], [], [], max(0, min(0.25, deadline - time.monotonic()))
            )
            if not readable:
                continue
            try:
                chunk = os.read(connection.fd, 256)
            except BlockingIOError:
                continue
            if not chunk:
                raise ConnectionError("USB disconnected during commissioning; installation unconfirmed")
            received.extend(chunk)
            while b"\n" in received:
                line, _, tail = received.partition(b"\n")
                received[:] = tail
                if not line.startswith(expected):
                    continue
                match = re.fullmatch(rb"(-?[0-9]+) (FRB-[0-9]{4}|-)\r", line[len(expected):])
                if match is None:
                    raise RuntimeError("malformed commissioning acknowledgement")
                status = int(match[1])
                identity = match[2].decode("ascii")
                if status != 0 and not (operation == b"?" and status == -errno.ENOENT):
                    raise RuntimeError(f"device rejected commissioning operation (status {status})")
                if operation != b"?" and identity != device_id:
                    raise RuntimeError("commissioning acknowledgement has the wrong device identity")
                return identity
            if len(received) > 4096:
                raise RuntimeError("commissioning serial response exceeded the protocol limit")
        raise TimeoutError("commissioning acknowledgement not received")
    finally:
        packet[:] = bytes(len(packet))
        received[:] = bytes(len(received))


def connect_commissioner(probe_serial: str) -> SerialConnection:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        connection = SerialConnection("", probe_serial)
        try:
            connection.open(deadline)
            transaction(connection, b"?")
            return connection
        except TimeoutError:
            connection.close()
            if time.monotonic() >= deadline:
                raise
        except BaseException:
            connection.close()
            raise
    raise TimeoutError("commissioning application did not become available")


def run_probe(probe_serial: str, *command: str, timeout=120) -> None:
    result = subprocess.run(
        ["probe-rs", command[0], "--chip", "nRF9151_xxAA",
         "--probe", f"2e8a:000c:{probe_serial}", "--non-interactive", *command[1:]],
        capture_output=True, timeout=timeout, check=False,
    )
    if result.returncode:
        # Debug output may contain memory; expose operation and exit status, not raw dumps.
        raise RuntimeError(
            f"probe-rs {command[0]} failed (exit {result.returncode}); no next stage executed. "
            "The device may be partially changed; establish its state before retrying."
        )


def require_probe(probe_serial: str) -> None:
    inventory = subprocess.run(
        ["probe-rs", "list"], capture_output=True, text=True, check=True, timeout=5
    )
    matches = re.findall(
        r"2e8a:000c(?:-[0-9]+)?:([A-Za-z0-9_-]+)\s+\(CMSIS-DAP\)",
        inventory.stdout,
        flags=re.IGNORECASE,
    )
    if matches.count(probe_serial) != 1:
        raise RuntimeError(
            "exact USB debugger is not available; no device changes performed. "
            "Establish stable authorized service access before running again; "
            "this utility does not wait for reconnection or capture startup."
        )


def load_admin_token(path: str) -> str:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() \
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 16384:
            raise ValueError("Admin session file must be current-user-owned, regular, mode 0600")
        with os.fdopen(fd, "r", encoding="ascii") as source:
            fd = -1
            token = source.read().strip()
    finally:
        if fd >= 0:
            os.close(fd)
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
        raise ValueError("Admin session file does not contain a valid bearer token")
    return token


def receive_admin_session(port: int) -> str:
    token = ""
    route = "/admin-session/" + secrets.token_urlsafe(24)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format, *args):
            pass

        def authorized(self):
            return self.path == route and self.headers.get("Origin") == "https://app.fairwayrefresh.com"

        def respond(self, status):
            self.send_response(status)
            self.send_header("Access-Control-Allow-Origin", "https://app.fairwayrefresh.com")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_OPTIONS(self):
            self.respond(204 if self.authorized() else 403)

        def do_POST(self):
            nonlocal token
            if not self.authorized():
                self.respond(403)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 16384:
                    raise ValueError("invalid session length")
                candidate = self.rfile.read(length).decode("ascii")
                if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", candidate):
                    raise ValueError("invalid session")
            except (ValueError, UnicodeError):
                self.respond(400)
                return
            token = candidate
            self.respond(204)

    with HTTPServer(("127.0.0.1", port), Handler) as server:
        server.timeout = 1
        deadline = time.monotonic() + 180
        print(f"ADMIN SESSION HANDOFF: http://127.0.0.1:{server.server_port}{route}", flush=True)
        while not token and time.monotonic() < deadline:
            server.handle_request()
    if not token:
        raise TimeoutError("authenticated Admin session was not supplied; no device operations performed")
    return token


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Admin API redirect refused; credential was not forwarded")


class RotationClient:
    def __init__(self, token: str, device_id: str, operation_id: str):
        if not valid_device_id(device_id):
            raise ValueError("invalid rotation device identity")
        uuid.UUID(operation_id)
        self.token = token
        self.device_id = device_id
        self.operation_id = operation_id

    def request(self, activate=False):
        path = f"/api/v1/admin/devices/{self.device_id}/credential-rotations/{self.operation_id}"
        if activate:
            path += "/activate"
        request = urllib.request.Request(
            ADMIN_ORIGIN + path,
            data=b'{"confirmed":true}' if activate else None,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            method="POST" if activate else "GET",
        )
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
                result = json.load(response)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Admin rotation API denied the request (HTTP {exc.code})") from None
        if not isinstance(result, dict):
            raise RuntimeError("Admin rotation API returned an invalid response")
        operation = result
        if not isinstance(operation, dict) or operation.get("device_id") != self.device_id \
                or operation.get("operation_id") != self.operation_id:
            raise RuntimeError("Admin rotation response does not match the device and operation")
        return operation


def validate_pair(commissioning: dict, operational: dict) -> None:
    if commissioning.get("image_role") != "usb_commissioning" \
            or operational.get("image_role") is not None \
            or operational.get("release_id") not in ("OTA-0.1", "OTA-0.1-r3"):
        raise ValueError("commissioning and operational artifact roles do not match")
    for field in ("generated_partition_layout", "generated_protected_storage_configuration"):
        if commissioning.get(field) != operational.get(field):
            raise ValueError(f"commissioning/operational {field} differ; storage compatibility unproven")
    if commissioning.get("signing", {}).get("fingerprint") != operational.get("signing", {}).get("fingerprint"):
        raise ValueError("commissioning and operational signing trust differ")
    layout = operational["generated_partition_layout"]
    for region, address in (("mcuboot_primary", 0x10000), ("tfm_its", 0xE8000),
                            ("tfm_otp_nv_counters", 0xF0000), ("tfm_ps", 0xF8000)):
        if layout.get(region, {}).get("address") != address:
            raise ValueError("protected-storage layout is unsupported")
    if layout.get("mcuboot_primary", {}).get("size") != 0x6C000:
        raise ValueError("operational primary slot differs from the supported layout")


def commission(args, commissioning: dict, operational: dict, device_key: str, backend) -> None:
    validate_pair(commissioning, operational)
    rotation = backend.request()
    if rotation.get("state") not in ("prepared", "activated"):
        raise RuntimeError("matching credential rotation is not usable")
    if rotation["state"] == "prepared" and rotation.get("can_activate") is not True:
        raise RuntimeError("matching prepared rotation cannot be activated")

    helper_root = args.commissioning_manifest.parent
    helper = helper_root / commissioning["artifact_file"]
    final = args.operational_manifest.parent / operational["artifact_file"]
    helper_bytes = helper.read_bytes()
    final_bytes = final.read_bytes()
    if helper_bytes[0x200:0x20000] != final_bytes[0x200:0x20000] \
            or len(helper_bytes) < 0x20000 or len(final_bytes) < 0x20000:
        raise ValueError("commissioning and OTA 0.1 secure TF-M payloads differ")
    if len(final_bytes) > 0x6C000:
        raise ValueError("operational image exceeds primary slot")
    require_probe(args.probe_serial)
    if args.erase:
        if rotation["state"] == "activated":
            raise RuntimeError("erase refused for an activated rotation; use storage-preserving maintenance")
        print("Erasing the selected device once; existing firmware and credentials will be destroyed.",
              flush=True)
        run_probe(args.probe_serial, "erase", "--allow-erase-all")
    print("Installing verified commissioning firmware.", flush=True)
    if args.erase:
        run_probe(args.probe_serial, "download", "--binary-format", "hex", "--verify",
                  str(helper_root / commissioning["merged_artifact_file"]))
    else:
        run_probe(args.probe_serial, "download", "--binary-format", "bin", "--base-address",
                  "0x10000", "--verify", "--restore-unwritten", str(helper))
    run_probe(args.probe_serial, "reset")
    connection = connect_commissioner(args.probe_serial)
    try:
        transaction(connection, b"P", args.device_id, device_key)
        transaction(connection, b"V", args.device_id, device_key)
    finally:
        connection.close()
    print("TF-M installation verified. Rebooting commissioner to verify persistent storage.", flush=True)
    run_probe(args.probe_serial, "reset")
    connection = connect_commissioner(args.probe_serial)
    try:
        transaction(connection, b"V", args.device_id, device_key)
    finally:
        connection.close()
    print("TF-M credential verified after reboot; flashing approved OTA 0.1 primary image.", flush=True)
    run_probe(args.probe_serial, "download", "--binary-format", "bin", "--base-address",
              "0x10000", "--verify", "--restore-unwritten", str(final))
    # No erase-all is permitted after TF-M provisioning. The final image spans primary only.
    if rotation["state"] == "prepared":
        result = backend.request(activate=True)
        if result.get("state") != "activated":
            raise RuntimeError("backend did not confirm rotation activation; device not reset")
    run_probe(args.probe_serial, "reset")
    print("OTA 0.1 flashed and reset; matching backend rotation activated. "
          "COMMISSIONING IS NOT COMPLETE until a real authenticated device request and "
          "normal COMPLETE response are verified.", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe-serial", required=True)
    parser.add_argument("--credential-file", required=True)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--operation-id", required=True)
    parser.add_argument("--commissioning-manifest", required=True, type=Path)
    parser.add_argument("--operational-manifest", required=True, type=Path)
    parser.add_argument("--ncs-install-dir", required=True, type=Path)
    parser.add_argument("--signing-key", required=True, type=Path)
    auth = parser.add_mutually_exclusive_group(required=True)
    auth.add_argument("--admin-token-file")
    auth.add_argument("--admin-session-port", type=int,
                      help="receive the signed-in Admin bearer once over loopback (0 selects a free port)")
    parser.add_argument("--erase", action="store_true",
                        help="authorize one complete erase and clean installation; "
                             "requires an already accessible exact probe and prepared rotation")
    args = parser.parse_args()
    device_key = ""
    try:
        from build_ota_release import _temporarily_unlocked_signing_key
        from verify_ota_release import verify_release

        device_id, device_key = load_credential_file(
            args.credential_file, args.device_id, args.operation_id
        )
        token = (
            load_admin_token(args.admin_token_file) if args.admin_token_file
            else receive_admin_session(args.admin_session_port)
        )
        backend = RotationClient(token, device_id, args.operation_id)
        with _temporarily_unlocked_signing_key(args.signing_key) as (key, _fingerprint):
            commissioning = verify_release(
                args.commissioning_manifest, args.ncs_install_dir, key, commissioning=True
            )
            operational = verify_release(args.operational_manifest, args.ncs_install_dir, key)
        commission(args, commissioning, operational, device_key, backend)
    except (OSError, termios.error, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"Device provisioning failed: {exc}", file=sys.stderr)
        return 1
    finally:
        device_key = ""
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
