'use strict';

/*
 * Canonical Fleet Administration + Device Health (WP2) schema constants and
 * validators. Pure functions only; no Firestore dependency in this file.
 */

const DEVICE_STATES = Object.freeze({
  IN_INVENTORY: 'in_inventory',
  DEPLOYED: 'deployed',
  MAINTENANCE: 'maintenance',
  RETIRED: 'retired',
});

const DEVICE_STATE_VALUES = Object.freeze(Object.values(DEVICE_STATES));

function isValidDeviceState(state) {
  return DEVICE_STATE_VALUES.includes(state);
}

/*
 * Legacy compatibility: current request ingestion (index.js createButtonRequest)
 * reads device.active directly as a boolean gate. `state` is the operational/
 * admin lifecycle state; `active` is a distinct backend/device communication
 * access flag. Only Retired denies backend access; In Inventory, Deployed, and
 * Maintenance all permit it. Devices created/updated through the fleet
 * primitives always derive `active` from `state` via this mapping so index.js
 * keeps working unmodified.
 */
function deriveLegacyActiveFlag(state) {
  return state !== DEVICE_STATES.RETIRED;
}

const MARKER_LOCATION_TYPES = Object.freeze({
  HOLE: 'hole',
  CUSTOM: 'custom',
});

const MIN_HOLE_NUMBER = 1;
const MAX_HOLE_NUMBER = 18;

/*
 * location shape: { type: 'hole', hole: 1-18 } or { type: 'custom', name: string }.
 * GPS coordinates are a future extension (not implemented here) and would be
 * added as additional optional fields on this same object without requiring
 * a breaking schema change.
 */
function isValidMarkerLocation(location) {
  if (!location || typeof location !== 'object') {
    return false;
  }

  if (location.type === MARKER_LOCATION_TYPES.HOLE) {
    return (
      Number.isInteger(location.hole) &&
      location.hole >= MIN_HOLE_NUMBER &&
      location.hole <= MAX_HOLE_NUMBER
    );
  }

  if (location.type === MARKER_LOCATION_TYPES.CUSTOM) {
    return typeof location.name === 'string' && location.name.trim().length > 0;
  }

  return false;
}

const ID_PREFIXES = Object.freeze({
  CUSTOMER: 'CUST',
  COURSE: 'COURSE',
  DEVICE: 'FRB',
});

const ID_PAD_LENGTH = 4;

function formatId(prefix, sequenceNumber) {
  const padded = String(sequenceNumber).padStart(ID_PAD_LENGTH, '0');
  return `${prefix}-${padded}`;
}

module.exports = {
  DEVICE_STATES,
  DEVICE_STATE_VALUES,
  isValidDeviceState,
  deriveLegacyActiveFlag,
  MARKER_LOCATION_TYPES,
  MIN_HOLE_NUMBER,
  MAX_HOLE_NUMBER,
  isValidMarkerLocation,
  ID_PREFIXES,
  ID_PAD_LENGTH,
  formatId,
};
