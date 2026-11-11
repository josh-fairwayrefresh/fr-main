import contextlib
import copy
import errno
import io
import json
import os
from pathlib import Path
import plistlib
import pty
import select
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest import mock
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parent))
import provision_device_identity as provisioner  # noqa: E402


DEVICE_ID = "FRB-9001"
DEVICE_KEY = "A" * 43
OPERATION_ID = "123e4567-e89b-12d3-a456-426614174000"
PROBE_SERIAL = "synthetic-probe"


class CredentialFileTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = Path(self.temp_dir.name) / "credential.json"
        self.data = {
            "device_id": DEVICE_ID,
            "operation_id": OPERATION_ID,
            "one_time_credential": DEVICE_KEY,
        }
        self.save()

    def save(self):
        self.path.write_text(json.dumps(self.data), encoding="utf-8")
        self.path.chmod(0o600)

    def load(self, device_id=DEVICE_ID, operation_id=OPERATION_ID):
        return provisioner.load_credential_file(str(self.path), device_id, operation_id)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_loads_exact_owner_only_credential(self):
        self.assertEqual(self.load(), (DEVICE_ID, DEVICE_KEY))

    def test_rejects_readable_or_writable_by_others(self):
        for mode in (0o644, 0o660, 0o604):
            with self.subTest(mode=mode):
                self.path.chmod(mode)
                with self.assertRaisesRegex(ValueError, "0600"):
                    self.load()

    def test_rejects_wrong_owner(self):
        actual = self.path.stat()
        other = mock.Mock(st_mode=actual.st_mode, st_uid=os.geteuid() + 1)
        with mock.patch.object(provisioner.os, "fstat", return_value=other):
            with self.assertRaisesRegex(ValueError, "current-user-owned"):
                self.load()

    def test_rejects_another_device_or_operation(self):
        with self.assertRaisesRegex(ValueError, "Device ID"):
            self.load(device_id="FRB-9002")
        with self.assertRaisesRegex(ValueError, "operation ID"):
            self.load(operation_id="223e4567-e89b-12d3-a456-426614174000")

    def test_rejects_symlink(self):
        link = self.path.with_name("link.json")
        link.symlink_to(self.path)
        with self.assertRaises(OSError):
            provisioner.load_credential_file(str(link), DEVICE_ID, OPERATION_ID)

    def test_rejects_malformed_input_without_echoing_content(self):
        for value in (None, [], {"device_id": None}, {**self.data, "one_time_credential": None}):
            with self.subTest(value_type=type(value).__name__):
                self.data = value
                self.save()
                with self.assertRaises(ValueError) as failure:
                    self.load()
                self.assertNotIn(DEVICE_KEY, str(failure.exception))

    def test_validation_rejects_unicode_and_noncanonical_keys(self):
        self.assertFalse(provisioner.valid_device_id("FRB-１２３４"))
        for key in (None, DEVICE_KEY[:-1] + "B", "!" * 43, "\u00e9" * 43):
            self.assertFalse(provisioner.valid_device_key(key))

    def test_token_file_protections_and_shape(self):
        self.path.write_text("aaa.bbb.ccc\n")
        self.assertEqual(provisioner.load_admin_token(str(self.path)), "aaa.bbb.ccc")
        self.path.chmod(0o644)
        with self.assertRaises(ValueError):
            provisioner.load_admin_token(str(self.path))


class DiscoveryTests(unittest.TestCase):
    @staticmethod
    def device(serial, port):
        return {
            "IOObjectClass": "IOUSBHostDevice",
            "USB Serial Number": serial,
            "idVendor": 0x2E8A,
            "idProduct": 0x000C,
            "IORegistryEntryChildren": [{
                "IOObjectClass": "IOUSBHostInterface",
                "IORegistryEntryChildren": [{"IOCalloutDevice": port}],
            }],
        }

    def test_cdc_is_descendant_of_exact_probe_not_just_same_vid_pid(self):
        registry = [
            self.device("another-probe", "/dev/cu.usbmodem1"),
            self.device(PROBE_SERIAL, "/dev/cu.usbmodem9"),
        ]
        self.assertEqual(
            provisioner._registry_ports(registry, PROBE_SERIAL), ["/dev/cu.usbmodem9"]
        )

    def test_no_matching_probe_means_no_port(self):
        self.assertEqual(provisioner._registry_ports([], PROBE_SERIAL), [])

    def test_ambiguous_probe_cdc_ports_fail_closed(self):
        result = mock.Mock(stdout=plistlib.dumps([
            self.device(PROBE_SERIAL, "/dev/cu.usbmodem1"),
            self.device(PROBE_SERIAL, "/dev/cu.usbmodem2"),
        ]))
        with mock.patch.object(provisioner.sys, "platform", "darwin"), \
             mock.patch.object(provisioner.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(ValueError, "refusing to guess"):
                provisioner._discover_probe_port(PROBE_SERIAL)

    def test_configuration_failure_closes_descriptor(self):
        connection = provisioner.SerialConnection("/dev/synthetic")
        with mock.patch.object(provisioner.os, "open", return_value=7), \
             mock.patch.object(provisioner.os, "close") as close, \
             mock.patch.object(provisioner.fcntl, "ioctl"), \
             mock.patch.object(provisioner, "configure_serial", side_effect=ValueError("invalid")):
            with self.assertRaises(ValueError):
                connection.open(time.monotonic() + 1)
            # Unexpected programming errors are not hidden by USB reconnect logic.
            connection.close()
        close.assert_called_once_with(7)


class SerialProtocolTests(unittest.TestCase):
    def test_actual_pty_burst_transaction_with_nonce_crc_and_no_secret_output(self):
        master, slave = pty.openpty()
        connection = provisioner.SerialConnection(os.ttyname(slave))
        connection.open(time.monotonic() + 1)
        result = {}

        def target():
            try:
                # The commissioner is persistent: it does not print a one-time ready prompt.
                frame = bytearray()
                deadline = time.monotonic() + 3
                while len(frame) < 76 and time.monotonic() < deadline:
                    if select.select([master], [], [], 0.1)[0]:
                        frame.extend(os.read(master, 256))
                result["frame"] = bytes(frame)
                result["valid_crc"] = zlib.crc32(frame[:-4]) == struct.unpack("<I", frame[-4:])[0]
                reply = b"FRC1 " + frame[5:21].hex().encode() + b" 0 " + DEVICE_ID.encode() + b"\r\n"
                os.write(master, DEVICE_KEY.encode() + b"\r\n")
                os.write(master, reply[:12])
                time.sleep(0.01)
                os.write(master, reply[12:])
            except Exception as exc:
                result["error"] = exc

        thread = threading.Thread(target=target)
        thread.start()
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                identity = provisioner.transaction(connection, b"P", DEVICE_ID, DEVICE_KEY)
            thread.join(4)
            self.assertFalse(thread.is_alive())
            self.assertNotIn("error", result)
            self.assertEqual(identity, DEVICE_ID)
            self.assertEqual(result["frame"][:5], b"FRC1P")
            self.assertEqual(result["frame"][21:-4], DEVICE_ID.encode() + DEVICE_KEY.encode())
            self.assertTrue(result["valid_crc"])
            self.assertNotIn(DEVICE_KEY, output.getvalue())
        finally:
            thread.join(4)
            connection.close()
            os.close(slave)
            os.close(master)

    def test_reply_identity_must_match(self):
        connection = mock.Mock(fd=7)
        nonce = b"x" * 16
        reply = b"FRC1 " + nonce.hex().encode() + b" 0 FRB-9002\r\n"
        with mock.patch.object(provisioner.secrets, "token_bytes", return_value=nonce), \
             mock.patch.object(provisioner, "send_packet"), \
             mock.patch.object(provisioner.select, "select", return_value=([7], [], [])), \
             mock.patch.object(provisioner.os, "read", return_value=reply):
            with self.assertRaisesRegex(RuntimeError, "wrong device"):
                provisioner.transaction(connection, b"V", DEVICE_ID, DEVICE_KEY)

    def test_no_device_ack_means_no_success_and_buffer_is_wiped(self):
        connection = mock.Mock(fd=7)
        with mock.patch.object(provisioner, "send_packet") as send, \
             mock.patch.object(provisioner.select, "select", return_value=([7], [], [])), \
             mock.patch.object(provisioner.os, "read", return_value=b""):
            with self.assertRaises(ConnectionError):
                provisioner.transaction(connection, b"P", DEVICE_ID, DEVICE_KEY)
        self.assertEqual(send.call_args.args[1], bytearray(76))

    def test_partial_write_preserves_packet_and_does_not_pace(self):
        transmitted = bytearray()

        def write(_fd, chunk):
            transmitted.extend(chunk[:3])
            return min(3, len(chunk))

        with mock.patch.object(provisioner.os, "write", side_effect=write), \
             mock.patch.object(provisioner.select, "select", return_value=([], [7], [])), \
             mock.patch.object(provisioner.time, "sleep") as sleep:
            provisioner.send_packet(7, bytearray(b"0123456789"), time.monotonic() + 1)
        self.assertEqual(transmitted, b"0123456789")
        sleep.assert_not_called()

    def test_no_secret_sent_on_invalid_inputs(self):
        with mock.patch.object(provisioner, "send_packet") as send:
            with self.assertRaises(ValueError):
                provisioner.transaction(mock.Mock(), b"P", "wrong", DEVICE_KEY)
        send.assert_not_called()


class OrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        (root / "signed.bin").write_bytes(b"x" * 0x21000)
        self.args = types.SimpleNamespace(
            commissioning_manifest=root / "commissioning.json",
            operational_manifest=root / "operational.json",
            erase=False, probe_serial=PROBE_SERIAL, device_id=DEVICE_ID,
        )
        self.operational = {
            "release_id": "OTA-0.1", "artifact_file": "signed.bin",
            "merged_artifact_file": "merged.hex",
            "generated_partition_layout": {
                "mcuboot_primary": {"address": 0x10000, "size": 0x6C000},
                "tfm_its": {"address": 0xE8000}, "tfm_otp_nv_counters": {"address": 0xF0000},
                "tfm_ps": {"address": 0xF8000},
            },
            "generated_protected_storage_configuration": {"tfm": {"secure": "y"}},
            "signing": {"fingerprint": "production-test"},
        }
        self.helper = {**copy.deepcopy(self.operational), "image_role": "usb_commissioning"}
        self.backend = mock.Mock()
        self.backend.request.side_effect = [
            {"state": "prepared", "can_activate": True}, {"state": "activated"}
        ]

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_sequence(self, fail_transaction=None, fail_flash=False, fail_operation=None):
        events = []
        self.events = events

        def tx(_connection, operation, *_):
            events.append(operation)
            if fail_transaction and events.count(operation) == fail_transaction[1] \
                    and operation == fail_transaction[0]:
                raise RuntimeError("device refused")

        def probe(_serial, *command):
            events.append(command)
            if command[0] == fail_operation:
                raise RuntimeError("probe operation failed")
            if fail_flash and command[0] == "download" and events.count(b"V") == 2:
                raise RuntimeError("flash failed")

        original_request = self.backend.request

        def request(*args, **kwargs):
            events.append("activate" if kwargs.get("activate") else "preflight")
            return original_request(*args, **kwargs)

        with mock.patch.object(provisioner, "run_probe", side_effect=probe), \
             mock.patch.object(provisioner, "require_probe"), \
             mock.patch.object(provisioner, "connect_commissioner", return_value=mock.Mock()), \
             mock.patch.object(provisioner, "transaction", side_effect=tx), \
             mock.patch.object(self.backend, "request", side_effect=request), \
             contextlib.redirect_stdout(io.StringIO()):
            provisioner.commission(self.args, self.helper, self.operational, DEVICE_KEY, self.backend)
        return events

    def test_install_reboot_verify_flash_then_activate_order(self):
        events = self.run_sequence()
        activation = events.index("activate")
        self.assertEqual(events.count(b"P"), 1)
        self.assertEqual(events.count(b"V"), 2)
        final_flash = [i for i, event in enumerate(events)
                       if isinstance(event, tuple) and event[0] == "download"][-1]
        self.assertLess(events.index(b"P"), final_flash)
        self.assertLess(final_flash, activation)
        self.assertEqual(events[-1], ("reset",))
        for event in events:
            if isinstance(event, tuple):
                self.assertNotIn("--allow-erase-all", event)
                self.assertNotIn("--chip-erase", event)

    def test_install_failure_prevents_activation(self):
        with self.assertRaises(RuntimeError):
            self.run_sequence(fail_transaction=(b"P", 1))
        self.backend.request.assert_called_once_with()

    def test_post_reboot_verification_failure_prevents_activation(self):
        with self.assertRaises(RuntimeError):
            self.run_sequence(fail_transaction=(b"V", 2))
        self.backend.request.assert_called_once_with()

    def test_final_flash_failure_prevents_activation(self):
        with self.assertRaises(RuntimeError):
            self.run_sequence(fail_flash=True)
        self.backend.request.assert_called_once_with()

    def test_mismatched_storage_layout_blocks_all_hardware_and_backend_operations(self):
        self.helper["generated_partition_layout"]["tfm_ps"]["address"] = 0
        with mock.patch.object(provisioner, "run_probe") as probe:
            with self.assertRaises(ValueError):
                self.run_sequence()
        self.backend.request.assert_not_called()
        probe.assert_not_called()

    def test_wrong_role_is_rejected(self):
        self.helper.pop("image_role")
        with self.assertRaises(ValueError):
            self.run_sequence()
        self.backend.request.assert_not_called()

    def test_revised_bootstrap_accepts_storage_and_trust_compatible_commissioner(self):
        for release_id in ("OTA-0.1-r3", "OTA-0.1-r4"):
            self.operational["release_id"] = release_id
            provisioner.validate_pair(self.helper, self.operational)

    def test_nightly_successor_is_not_a_usb_operational_bootstrap(self):
        for release_id in ("OTA-0.1alt-r3", "OTA-0.1alt-r4"):
            self.operational["release_id"] = release_id
            with self.assertRaises(ValueError):
                provisioner.validate_pair(self.helper, self.operational)

    def test_changed_secure_image_is_rejected(self):
        root = self.args.commissioning_manifest.parent
        (root / "other.bin").write_bytes(b"y" * 0x21000)
        self.helper["artifact_file"] = "other.bin"
        with mock.patch.object(provisioner, "run_probe") as probe:
            with self.assertRaisesRegex(ValueError, "TF-M payloads differ"):
                self.run_sequence()
        probe.assert_not_called()
        self.assertEqual(self.backend.request.call_count, 1)

    def test_erase_is_never_allowed_after_activation(self):
        self.args.erase = True
        self.backend.request.side_effect = [{"state": "activated"}]
        with self.assertRaisesRegex(RuntimeError, "erase refused"):
            self.run_sequence()
        self.assertFalse(any(isinstance(event, tuple) for event in self.events))

    def test_clean_install_erases_once_then_installs_full_helper_before_provisioning(self):
        self.args.erase = True
        events = self.run_sequence()
        operations = [event for event in events if isinstance(event, tuple)]
        self.assertEqual(operations[0], ("erase", "--allow-erase-all"))
        self.assertEqual(operations[1], (
            "download", "--binary-format", "hex", "--verify",
            str(self.args.commissioning_manifest.parent / "merged.hex"),
        ))
        self.assertEqual(sum(event[0] == "erase" for event in operations), 1)
        self.assertLess(events.index(operations[1]), events.index(b"P"))
        final = next(event for event in reversed(operations) if event[0] == "download")
        self.assertIn("--restore-unwritten", final)
        self.assertIn("0x10000", final)
        self.assertNotIn("--allow-erase-all", final)
        self.assertNotIn("--chip-erase", final)

    def test_ambiguous_erase_failure_stops_without_retry_flash_or_activation(self):
        self.args.erase = True
        with self.assertRaisesRegex(RuntimeError, "probe operation failed"):
            self.run_sequence(fail_operation="erase")
        self.assertEqual(self.events, ["preflight", ("erase", "--allow-erase-all")])
        self.backend.request.assert_called_once_with()

    def test_helper_flash_failure_stops_without_provisioning_or_activation(self):
        self.args.erase = True
        with self.assertRaisesRegex(RuntimeError, "probe operation failed"):
            self.run_sequence(fail_operation="download")
        self.assertNotIn(b"P", self.events)
        self.assertNotIn("activate", self.events)
        self.assertEqual(sum(isinstance(e, tuple) and e[0] == "download"
                             for e in self.events), 1)

    def test_activated_rotation_maintenance_preserves_storage_and_does_not_reactivate(self):
        self.backend.request.side_effect = [{"state": "activated"}]
        events = self.run_sequence()
        self.assertNotIn("activate", events)
        self.assertEqual(events.count(b"V"), 2)
        for event in events:
            if isinstance(event, tuple):
                self.assertNotEqual(event[0], "erase")
                self.assertNotIn("--allow-erase-all", event)
                if event[0] == "download":
                    self.assertIn("--restore-unwritten", event)

    def test_wrong_generation_preflight_prevents_device_changes(self):
        self.backend.request.side_effect = [{"state": "prepared", "can_activate": False}]
        with mock.patch.object(provisioner, "run_probe") as probe:
            with self.assertRaisesRegex(RuntimeError, "cannot be activated"):
                self.run_sequence()
        probe.assert_not_called()


class ProbeAccessTests(unittest.TestCase):
    def test_exact_accessible_probe_is_required_once_without_reconnection_wait(self):
        inventory = mock.Mock(stdout=(
            f"[0]: Debug Probe -- 2e8a:000c-0:{PROBE_SERIAL} (CMSIS-DAP)\n"
        ))
        with mock.patch.object(provisioner.subprocess, "run", return_value=inventory) as run, \
             mock.patch.object(provisioner.time, "sleep") as sleep:
            provisioner.require_probe(PROBE_SERIAL)
        run.assert_called_once_with(
            ["probe-rs", "list"], capture_output=True, text=True, check=True, timeout=5
        )
        sleep.assert_not_called()

    def test_absent_wrong_ambiguous_or_partial_probe_never_causes_retry_or_erase(self):
        for output in ("", "2e8a:000c:other (CMSIS-DAP)",
                       f"2e8a:000c:{PROBE_SERIAL}-other (CMSIS-DAP)",
                       f"9999:000c:{PROBE_SERIAL} (CMSIS-DAP)",
                       f"2e8a:000c:{PROBE_SERIAL} (CMSIS-DAP)\n" * 2):
            with self.subTest(output=output), \
                 mock.patch.object(provisioner.subprocess, "run",
                                   return_value=mock.Mock(stdout=output)) as run, \
                 mock.patch.object(provisioner, "run_probe") as probe, \
                 mock.patch.object(provisioner.time, "sleep") as sleep:
                with self.assertRaisesRegex(RuntimeError, "Establish stable authorized service access"):
                    provisioner.require_probe(PROBE_SERIAL)
                self.assertEqual(run.call_count, 1)
                probe.assert_not_called()
                sleep.assert_not_called()

    def test_absent_probe_blocks_entire_sequence_before_any_device_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "signed.bin").write_bytes(b"x" * 0x21000)
            manifest = {
                "release_id": "OTA-0.1", "artifact_file": "signed.bin",
                "merged_artifact_file": "merged.hex",
            }
            args = types.SimpleNamespace(
                commissioning_manifest=root / "helper.json",
                operational_manifest=root / "final.json", probe_serial=PROBE_SERIAL,
                erase=True,
            )
            backend = mock.Mock()
            backend.request.return_value = {"state": "prepared", "can_activate": True}
            with mock.patch.object(provisioner, "validate_pair"), \
                 mock.patch.object(provisioner.subprocess, "run",
                                   return_value=mock.Mock(stdout="")), \
                 mock.patch.object(provisioner, "run_probe") as probe:
                with self.assertRaisesRegex(RuntimeError, "exact USB debugger"):
                    provisioner.commission(args, manifest, manifest, DEVICE_KEY, backend)
            probe.assert_not_called()
            backend.request.assert_called_once_with()

    def test_probe_failure_never_reports_success(self):
        with mock.patch.object(provisioner.subprocess, "run", return_value=mock.Mock(returncode=1)):
            with self.assertRaises(RuntimeError):
                provisioner.run_probe(PROBE_SERIAL, "download", "synthetic.hex")

    def test_admin_redirect_is_refused(self):
        with self.assertRaises(RuntimeError):
            provisioner.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com")


class FirmwarePolicyTests(unittest.TestCase):
    def setUp(self):
        self.source = Path(__file__).resolve().parents[1] / "samples/fairway_power_sandbox/src"

    def test_field_policy_does_not_infer_usb_from_vbus_or_disable_psm(self):
        policy = (self.source / "power_policy.c").read_text()
        self.assertIn("return set_buck2_service_rail(service_mode);", policy)
        self.assertIn("enabled ? regulator_enable(buck2_dev) : regulator_disable(buck2_dev)", policy)
        self.assertIn("while (interaction_awake_active)", policy)
        self.assertIn("k_sem_take(&keeper_sem, K_FOREVER);", policy)
        self.assertNotIn("vbus_hold", policy)
        self.assertNotIn("modem_service_set_psm_requested", policy)

    def test_operational_service_gate_precedes_lte_and_retains_boot_button_selection(self):
        main = (self.source / "main.c").read_text()
        self.assertIn("button_ux_is_pressed(&service_mode)", main)
        self.assertIn("power_policy_init(service_mode)", main)
        service = main.index('LOG_INF("Debugger service mode:')
        field = main.index("modem_service_notify_local_hw_ready")
        self.assertLess(service, field)
        self.assertIn("k_sleep(K_FOREVER);", main[service:field])
        self.assertNotIn("fairway_device_identity_provision(", main)

    def test_commissioner_remains_separate_from_field_runtime(self):
        commissioner = (self.source / "usb_commissioning.c").read_text()
        self.assertIn("power_policy_init(true)", commissioner)
        self.assertIn("uart_irq_rx_enable(uart);", commissioner)
        self.assertIn("fairway_device_identity_provision(expected_id, expected_key)", commissioner)
        self.assertNotIn("button_ux_is_pressed", commissioner)
        self.assertNotIn("modem_service_notify_local_hw_ready", commissioner)
        self.assertNotIn("fairway_ota_delivery_init", commissioner)


class DeviceStorageTests(unittest.TestCase):
    def test_real_c_psa_identity_writer_is_idempotent_and_rejects_conflicts(self):
        compiler = shutil.which("cc")
        self.assertIsNotNone(compiler, "a host C compiler is required for storage validation")
        source = Path(__file__).resolve().parents[1] / "samples/fairway_power_sandbox/src"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "psa").mkdir()
            (root / "psa/storage_common.h").write_text(
                "#include <stdint.h>\n#include <stddef.h>\n"
                "typedef uint64_t psa_storage_uid_t;\ntypedef int psa_status_t;\n"
                "#define PSA_SUCCESS 0\n#define PSA_ERROR_DOES_NOT_EXIST -140\n"
                "#define PSA_STORAGE_FLAG_WRITE_ONCE 1\n"
            )
            (root / "psa/protected_storage.h").write_text(
                '#include "storage_common.h"\n'
                "psa_status_t psa_ps_get(psa_storage_uid_t,size_t,size_t,void*,size_t*);\n"
                "psa_status_t psa_ps_set(psa_storage_uid_t,size_t,const void*,uint32_t);\n"
            )
            harness = root / "storage_test.c"
            harness.write_text(r'''
#include <assert.h>
#include <stdbool.h>
#include <string.h>
#include "device_identity.c"
static char id[9], key[44];
static int writes;
static bool fail_key_write;
psa_status_t psa_ps_get(psa_storage_uid_t uid, size_t offset, size_t capacity,
                       void *output, size_t *length) {
    assert(offset == 0);
    char *value = uid == FAIRWAY_DEVICE_ID_UID ? id : key;
    if (!value[0]) return PSA_ERROR_DOES_NOT_EXIST;
    *length = strlen(value) + 1;
    assert(*length <= capacity);
    memcpy(output, value, *length);
    return PSA_SUCCESS;
}
psa_status_t psa_ps_set(psa_storage_uid_t uid, size_t length,
                       const void *value, uint32_t flags) {
    if (uid == FAIRWAY_DEVICE_ID_UID) {
        assert(flags == PSA_STORAGE_FLAG_WRITE_ONCE);
        assert(!id[0]);
    } else if (fail_key_write) return -1;
    memcpy(uid == FAIRWAY_DEVICE_ID_UID ? id : key, value, length);
    writes++;
    return PSA_SUCCESS;
}
int main(void) {
    const char *credential = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    struct fairway_device_identity identity;
    assert(fairway_device_identity_provision("wrong", credential) == -EINVAL);
    assert(writes == 0);
    fail_key_write = true;
    assert(fairway_device_identity_provision("FRB-9001", credential) == -EIO);
    assert(writes == 1);
    assert(strcmp(id, "FRB-9001") == 0 && !key[0]);
    fail_key_write = false;
    assert(fairway_device_identity_provision("FRB-9001", credential) == 0);
    assert(writes == 2);
    assert(fairway_device_identity_provision("FRB-9001", credential) == -EALREADY);
    assert(writes == 2);
    assert(fairway_device_identity_provision("FRB-9002", credential) == -EEXIST);
    assert(fairway_device_identity_provision("FRB-9001",
        "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") == -EEXIST);
    assert(writes == 2);
    assert(fairway_device_identity_load(&identity) == 0);
    assert(strcmp(identity.device_id, "FRB-9001") == 0);
    assert(strcmp(identity.device_key, credential) == 0);
    return 0;
}
''')
            executable = root / "storage_test"
            subprocess.run(
                [compiler, "-std=c11", "-Wall", "-Wextra", "-Werror",
                 "-I", str(root), "-I", str(source), str(harness), "-o", str(executable)],
                check=True, capture_output=True,
            )
            subprocess.run([str(executable)], check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
