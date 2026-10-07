#!/bin/sh
set -eu

APP=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
: "${ZEPHYR_BASE:?Set ZEPHYR_BASE to the installed NCS 3.1.1 Zephyr tree}"

OUT=$(mktemp -d "${TMPDIR:-/tmp}/fairway-host-tests.XXXXXX")
trap 'rm -rf "$OUT"' EXIT HUP INT TERM

${CC:-cc} -std=gnu11 -Wall -Wextra \
  -I"$APP/tests/complete_poll/host" \
  -I"$APP/src" \
  -I"$ZEPHYR_BASE/include" \
  "$APP/tests/complete_poll/src/main.c" \
  "$APP/src/complete_poll.c" \
  "$APP/src/demand_window.c" \
  "$APP/src/golfer_txn.c" \
  "$APP/src/golfer_protocol.c" \
  "$ZEPHYR_BASE/lib/utils/json.c" \
  -lm -o "$OUT/fairway-host-tests"

"$OUT/fairway-host-tests"