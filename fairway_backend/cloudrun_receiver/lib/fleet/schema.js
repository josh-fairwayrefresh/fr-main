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
 * Canonical backend/device communication permission, derived from `state`.
 * There is no independent `active` field in the canonical Device schema;
 * only In Inventory, Deployed, and Maintenance permit communication.
 * Retired, missing, malformed, and unknown states all deny it.
 */
function isDeviceCommunicationAllowed(state) {
  return (
    state === DEVICE_STATES.IN_INVENTORY ||
    state === DEVICE_STATES.DEPLOYED ||
    state === DEVICE_STATES.MAINTENANCE
  );
}

/*
 * Canonical authenticated Device request event types. `button_press` is the
 * existing golfer-request event; `health_report` is the WP4 Device Health
 * transport event. Both share the same request endpoint and authentication
 * path; an event_type outside this set is rejected rather than silently
 * treated as `button_press`.
 */
const EVENT_TYPES = Object.freeze({
  BUTTON_PRESS: 'button_press',
  HEALTH_REPORT: 'health_report',
});

const EVENT_TYPE_VALUES = Object.freeze(Object.values(EVENT_TYPES));

function isValidEventType(eventType) {
  return EVENT_TYPE_VALUES.includes(eventType);
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

/*
 * `location` is the single canonical source of marker placement; hole number
 * and any display text are always derived from it rather than stored
 * independently on the Device document.
 */
function deriveHoleFromLocation(location) {
  if (location && location.type === MARKER_LOCATION_TYPES.HOLE) {
    return location.hole;
  }

  return null;
}

function deriveDisplayLabelFromLocation(location) {
  if (!location) {
    return null;
  }

  if (location.type === MARKER_LOCATION_TYPES.HOLE) {
    return `Hole ${location.hole}`;
  }

  if (location.type === MARKER_LOCATION_TYPES.CUSTOM) {
    return location.name;
  }

  return null;
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
  isDeviceCommunicationAllowed,
  EVENT_TYPES,
  EVENT_TYPE_VALUES,
  isValidEventType,
  MARKER_LOCATION_TYPES,
  MIN_HOLE_NUMBER,
  MAX_HOLE_NUMBER,
  isValidMarkerLocation,
  deriveHoleFromLocation,
  deriveDisplayLabelFromLocation,
  ID_PREFIXES,
  ID_PAD_LENGTH,
  formatId,
};
