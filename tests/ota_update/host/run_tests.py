#!/usr/bin/env python3
"""Compile and run the real OTA manager with host-only boundary fakes."""

import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile


def main() -> int:
    test_dir = Path(__file__).resolve().parents[1]
    repo_dir = test_dir.parents[1]
    source_dir = repo_dir / "samples/fairway_power_sandbox/src"
    host_dir = test_dir / "host"
    compiler = shlex.split(os.environ.get("CC", "cc"))
    if not compiler or shutil.which(compiler[0]) is None:
        raise SystemExit("A C compiler is required to run the OTA host tests")

    sources = [
        test_dir / "src/main.c",
        host_dir / "manager_test.c",
        host_dir / "scheduler_test.c",
        host_dir / "delivery_worker_test.c",
        host_dir / "fakes.c",
        host_dir / "ztest.c",
        source_dir / "ota_update.c",
        source_dir / "ota_update_policy.c",
        source_dir / "ota_update_staging.c",
        source_dir / "ota_update_scheduler.c",
        source_dir / "ota_delivery_reporting.c",
        source_dir / "ota_delivery.c",
    ]
    with tempfile.TemporaryDirectory(prefix="fairway-ota-host-") as temp_dir:
        executable = Path(temp_dir) / "ota_manager_tests"
        registration_wait = re.findall(
            r"^void modem_service_wait_for_lte_registration\(void\)\n\{.*?^\}",
            (source_dir / "modem_service.c").read_text(), re.MULTILINE | re.DOTALL,
        )
        if len(registration_wait) != 1:
            raise SystemExit("Expected exactly one real modem registration wait function")
        registration_source = Path(temp_dir) / "registration_wait_test.c"
        registration_source.write_text(
            (host_dir / "registration_wait_test.c").read_text()
            + "\n" + registration_wait[0] + "\n"
        )
        subprocess.run([
            *compiler, "-std=c11", "-Wall", "-Wextra", "-Werror", "-pthread",
            str(registration_source), "-o", str(executable),
        ], check=True)
        subprocess.run([str(executable)], check=True)
        command = [
            *compiler,
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-Werror",
            "-DFAIRWAY_OTA_TEST=1",
            '-DCONFIG_FAIRWAY_OTA_HARDWARE_ID="test-board"',
            "-DCONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS=17",
            "-DCONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS=900",
            "-DCONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY=0",
            "-DCONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME=1",
            '-DCONFIG_FAIRWAY_OTA_FIRMWARE_VERSION="0.1.0+1"',
            "-I",
            str(host_dir / "include"),
            "-I",
            str(host_dir),
            "-I",
            str(source_dir),
            *(str(source) for source in sources),
            "-o",
            str(executable),
        ]
        subprocess.run(command, check=True)
        subprocess.run([str(executable)], check=True)
        nightly_command = [
            "-DCONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY=1" if arg == "-DCONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY=0"
            else "-DCONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME=0" if arg == "-DCONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME=1"
            else arg for arg in command
        ]
        subprocess.run(nightly_command, check=True)
        subprocess.run([str(executable)], check=True)
        for version in ("0.1.0+4", "0.1.0+5", "1.0.0+3", "0.1.0+6", "0.1.0+7", "1.0.0+4"):
            subprocess.run([
                *compiler, "-std=c11", "-Wall", "-Wextra", "-Werror",
                f'-DCONFIG_FAIRWAY_OTA_FIRMWARE_VERSION="{version}"',
                "-I", str(host_dir / "include"), "-I", str(source_dir),
                str(host_dir / "reporting_protocol_test.c"),
                str(source_dir / "ota_update_reporting.c"),
                "-o", str(executable),
            ], check=True)
            subprocess.run([str(executable)], check=True)
        # Real SDK decoder: discovery parsing must not be validated against a fake.
        ncs = Path(os.environ.get("NCS_INSTALL_DIR", "/opt/nordic/ncs/v3.1.1"))
        sdk_json_source = ncs / "zephyr/lib/utils/json.c"
        sdk_json_header = ncs / "zephyr/include/zephyr/data/json.h"
        if not sdk_json_source.is_file() or not sdk_json_header.is_file():
            raise SystemExit("Set NCS_INSTALL_DIR to the installed NCS 3.1.1 SDK")
        sdk_include = Path(temp_dir) / "sdk-include"
        (sdk_include / "zephyr/data").mkdir(parents=True)
        shutil.copyfile(sdk_json_header, sdk_include / "zephyr/data/json.h")
        subprocess.run([
            *compiler, "-std=gnu11", "-Wall", "-Werror", "-Wno-unused-parameter",
            '-DCONFIG_FAIRWAY_OTA_HARDWARE_ID="circuitdojo_feather_nrf9151@1/nrf9151/ns"',
            '-DCONFIG_FAIRWAY_OTA_FIRMWARE_VERSION="0.1.0+6"',
            "-I", str(sdk_include), "-I", str(host_dir / "sdk_json_include"),
            "-I", str(source_dir),
            str(host_dir / "discovery_json_test.c"),
            str(source_dir / "ota_update_discovery.c"), str(sdk_json_source),
            "-o", str(executable),
        ], check=True)
        subprocess.run([str(executable)], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
