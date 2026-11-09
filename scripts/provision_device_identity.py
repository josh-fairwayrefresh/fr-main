#!/usr/bin/env python3
"""Provision a blank nRF9151 Fairway device over its service-mode UART."""

import argparse
import base64
import getpass
import os
import select
import sys
import termios
import time
import tty


PACKET_PREFIX = b"FRBP"
DEVICE_ID_LENGTH = 8
DEVICE_KEY_LENGTH = 43


def valid_device_id(value: str) -> bool:
    return (
        len(value) == DEVICE_ID_LENGTH
        and value.startswith("FRB-")
        and value[4:].isdigit()
    )


def valid_device_key(value: str) -> bool:
    try:
        decoded = base64.urlsafe_b64decode(f"{value}=")
    except (ValueError, base64.binascii.Error):
        return False
    return (
        len(value) == DEVICE_KEY_LENGTH
        and len(decoded) == 32
        and base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") == value
    )


def read_until(fd: int, expected: bytes, timeout: float) -> bool:
    received = bytearray()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready, _, _ = select.select([fd], [], [], min(0.25, deadline - time.monotonic()))
        if not ready:
            continue
        chunk = os.read(fd, 256)
        if not chunk:
            continue
        text = chunk.decode("utf-8", errors="replace")
        sys.stdout.write(text)
        sys.stdout.flush()
        received.extend(chunk)
        if expected in received:
            return True
        if len(received) > 4096:
            del received[:-len(expected)]
    return False


def provision(port: str, device_id: str, device_key: str) -> bool:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    packet = bytearray(PACKET_PREFIX + device_id.encode("ascii") + device_key.encode("ascii"))
    try:
        tty.setraw(fd)
        attrs = termios.tcgetattr(fd)
        attrs[4] = termios.B115200
        attrs[5] = termios.B115200
        attrs[2] |= termios.CLOCAL | termios.CREAD
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        if not read_until(fd, b"Fairway identity provisioning is ready.", 60):
            raise TimeoutError("device did not enter protected provisioning mode")
        deadline = time.monotonic() + 5
        sent = 0
        while sent < len(packet):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            _, writable, _ = select.select([], [fd], [], min(0.25, remaining))
            if writable:
                try:
                    sent += os.write(fd, packet[sent:])
                except BlockingIOError:
                    continue
        if sent != len(packet):
            raise TimeoutError("could not send the complete protected provisioning packet")
        return read_until(fd, b"Identity provisioning completed. Rebooting.", 5)
    finally:
        packet[:] = bytes(len(packet))
        os.close(fd)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="nRF9151 service-mode UART device")
    args = parser.parse_args()

    device_id = input("Permanent Device ID (FRB-XXXX): ").strip()
    if not valid_device_id(device_id):
        print("Invalid Device ID.", file=sys.stderr)
        return 2
    device_key = getpass.getpass("Existing backend device credential: ")
    if not valid_device_key(device_key):
        print("Invalid device credential format.", file=sys.stderr)
        return 2

    print("Waiting for the nRF9151 protected provisioning prompt...")
    try:
        if not provision(args.port, device_id, device_key):
            print("Device provisioning did not report success.", file=sys.stderr)
            return 1
    except (OSError, TimeoutError) as exc:
        print(f"Device provisioning failed: {exc}", file=sys.stderr)
        return 1
    print("Provisioning accepted. The device is rebooting; release the service button.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
