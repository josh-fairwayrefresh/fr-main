'use strict';

const UINT32_MAX = 0xffffffff;
const LEGACY_GOLFER_DEMAND_WINDOW_MS = 300000;

function isValidGolferDemandWindowMs(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= UINT32_MAX;
}

function validateGolferDemandWindowMs(value) {
  if (!isValidGolferDemandWindowMs(value)) {
    throw new Error('Invalid golfer_demand_window_ms: expected a positive uint32 integer');
  }
  return value;
}

function resolveGolferDemandWindowMs(course) {
  const value = course?.golfer_demand_window_ms;

  if (value === undefined || value === null) {
    return LEGACY_GOLFER_DEMAND_WINDOW_MS;
  }
  return validateGolferDemandWindowMs(value);
}

function resolveExistingRequestGolferDemandWindowMs(request) {
  const value = request?.golfer_demand_window_ms;

  if (value === undefined || value === null) {
    return LEGACY_GOLFER_DEMAND_WINDOW_MS;
  }
  return validateGolferDemandWindowMs(value);
}

module.exports = {
  UINT32_MAX,
  LEGACY_GOLFER_DEMAND_WINDOW_MS,
  isValidGolferDemandWindowMs,
  validateGolferDemandWindowMs,
  resolveGolferDemandWindowMs,
  resolveExistingRequestGolferDemandWindowMs,
};