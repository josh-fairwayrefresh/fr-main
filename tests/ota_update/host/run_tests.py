#!/usr/bin/env python3
"""Compile and run the real OTA manager with host-only boundary fakes."""

import os
from pathlib import Path
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
