'use strict';

const assert = require('assert');
const {
  LEGACY_GOLFER_DEMAND_WINDOW_MS,
  isValidGolferDemandWindowMs,
  validateGolferDemandWindowMs,
  resolveGolferDemandWindowMs,
  resolveExistingRequestGolferDemandWindowMs,
} = require('../lib/golfer_demand_window_policy');

const customPolicyMs = 9173;
assert.strictEqual(resolveGolferDemandWindowMs({ golfer_demand_window_ms: LEGACY_GOLFER_DEMAND_WINDOW_MS }), LEGACY_GOLFER_DEMAND_WINDOW_MS);
assert.strictEqual(resolveGolferDemandWindowMs({ golfer_demand_window_ms: customPolicyMs }), customPolicyMs);
assert.strictEqual(resolveGolferDemandWindowMs({}), LEGACY_GOLFER_DEMAND_WINDOW_MS);
assert.strictEqual(resolveGolferDemandWindowMs(null), LEGACY_GOLFER_DEMAND_WINDOW_MS);
assert.strictEqual(resolveExistingRequestGolferDemandWindowMs({}), LEGACY_GOLFER_DEMAND_WINDOW_MS);
assert.strictEqual(resolveExistingRequestGolferDemandWindowMs({ golfer_demand_window_ms: customPolicyMs }), customPolicyMs);

assert.strictEqual(validateGolferDemandWindowMs(1), 1);
assert.strictEqual(validateGolferDemandWindowMs(0xffffffff), 0xffffffff);
for (const value of [0, -1, 1.5, NaN, Infinity, '9173', 0x100000000]) {
  assert.strictEqual(isValidGolferDemandWindowMs(value), false);
  assert.throws(() => validateGolferDemandWindowMs(value), /uint32 integer/);
}
assert.throws(() => validateGolferDemandWindowMs(0), /golfer_demand_window_ms/);
assert.throws(() => resolveGolferDemandWindowMs({ golfer_demand_window_ms: '9173' }), /golfer_demand_window_ms/);

console.log('golfer_demand_window_policy: 13 cases passed');