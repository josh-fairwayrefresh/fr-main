'use strict';

const assert = require('assert');
const {
  isDeviceCommunicationAllowed,
  isValidEventType,
  EVENT_TYPES,
} = require('../lib/fleet/schema');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

// --- Fail-closed device-state matrix (pre-existing WP3 behavior; regression) ---

test('allows in_inventory, deployed, maintenance', () => {
  assert.strictEqual(isDeviceCommunicationAllowed('in_inventory'), true);
  assert.strictEqual(isDeviceCommunicationAllowed('deployed'), true);
  assert.strictEqual(isDeviceCommunicationAllowed('maintenance'), true);
});

test('denies retired, missing, malformed, unknown state values', () => {
  for (const state of ['retired', undefined, null, '', 'active', 'broken', {}, 42]) {
    assert.strictEqual(isDeviceCommunicationAllowed(state), false, `expected deny: ${String(state)}`);
  }
});

// --- WP4 event_type validation (new) ---

test('accepts exactly button_press and health_report', () => {
  assert.strictEqual(isValidEventType(EVENT_TYPES.BUTTON_PRESS), true);
  assert.strictEqual(isValidEventType(EVENT_TYPES.HEALTH_REPORT), true);
});

test('rejects unknown event_type values', () => {
  for (const value of ['foo', '', undefined, null, 'BUTTON_PRESS', 'health-report', 42, {}]) {
    assert.strictEqual(isValidEventType(value), false, `expected invalid: ${String(value)}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
