'use strict';

const {
  ID_PREFIXES,
  DEVICE_STATES,
  isValidDeviceState,
  deriveLegacyActiveFlag,
  isValidMarkerLocation,
} = require('./schema');
const { allocateNextId } = require('./ids');
const { CUSTOMERS_COLLECTION } = require('./customers');
const { COURSES_COLLECTION } = require('./courses');

const DEVICES_COLLECTION = 'devices';

/*
 * Device schema. Fields already read by the live request-ingestion path
 * (index.js createButtonRequest) are marked "(legacy, preserved)"; nothing
 * about their current meaning changes.
 *
 *   device_id            permanent FRB-XXXX identity, never reassigned
 *   state                 canonical DEVICE_STATES value (in_inventory,
 *                         deployed, maintenance, retired); no delete workflow
 *   active                (legacy, preserved) boolean gate read by index.js;
 *                         derived from `state` via deriveLegacyActiveFlag()
 *   customer_id            current assignment, mutable
 *   course_id              (legacy, preserved) current assignment, mutable
 *   course_name            (legacy, preserved) denormalized copy carried
 *                          into request documents by index.js
 *   location                { type: 'hole', hole: 1-18 } or
 *                          { type: 'custom', name: string }; future GPS
 *                          fields can be added to this object later without
 *                          a breaking schema change
 *   hole                   (legacy, preserved) numeric hole mirrored from
 *                          `location` when type === 'hole', read by index.js
 *   comments                administrator free-text notes
 *   sim_iccid                SIM ICCID association (string or null)
 *   hardware_revision       e.g. "Prototype 1.2" (string or null)
 *   firmware_generation     e.g. "LP 1.2" (string or null)
 *   commissioning           { commissioned_at, commissioned_by } or null
 *   service                 { last_service_at, last_service_by } or null
 *   credential_ref          placeholder only; per-device credential material
 *                          itself is WP3 scope and is not created here
 *   latest_health           placeholder for WP4; null until WP4 implements it
 *   gps                     placeholder for a future GPS extension; null
 *   created_at / updated_at  standard metadata
 */

function buildLegacyCompatibilityFields(state, location) {
  const fields = {
    active: deriveLegacyActiveFlag(state),
  };

  if (location && location.type === 'hole') {
    fields.hole = location.hole;
  } else {
    fields.hole = null;
  }

  return fields;
}

/*
 * Creates a Device document. Per CPO direction, a physical marker receives
 * its FRB id only after build/test reaches "Ready for Deployment"; this is
 * the backend primitive the future Admin "Add Device" workflow (WP5) will
 * call at that point. It is not wired into any exposed route in WP2.
 */
async function createDevice(db, {
  customerId = null,
  courseId = null,
  courseName = null,
  location = null,
  comments = null,
  simIccid = null,
  hardwareRevision = null,
  firmwareGeneration = null,
  state = DEVICE_STATES.IN_INVENTORY,
} = {}) {
  if (!isValidDeviceState(state)) {
    throw new Error(`Invalid device state: ${state}`);
  }
  if (location !== null && !isValidMarkerLocation(location)) {
    throw new Error('Invalid marker location');
  }
  if (customerId) {
    const customerSnap = await db.collection(CUSTOMERS_COLLECTION).doc(customerId).get();
    if (!customerSnap.exists) {
      throw new Error(`Unknown customer_id: ${customerId}`);
    }
  }
  if (courseId) {
    const courseSnap = await db.collection(COURSES_COLLECTION).doc(courseId).get();
    if (!courseSnap.exists) {
      throw new Error(`Unknown course_id: ${courseId}`);
    }
  }

  const deviceId = await allocateNextId(db, ID_PREFIXES.DEVICE);
  const now = new Date();

  const deviceDoc = {
    device_id: deviceId,
    state,
    customer_id: customerId,
    course_id: courseId,
    course_name: courseName,
    location,
    comments,
    sim_iccid: simIccid,
    hardware_revision: hardwareRevision,
    firmware_generation: firmwareGeneration,
    commissioning: null,
    service: null,
    credential_ref: null,
    latest_health: null,
    gps: null,
    created_at: now,
    updated_at: now,
    ...buildLegacyCompatibilityFields(state, location),
  };

  await db.collection(DEVICES_COLLECTION).doc(deviceId).set(deviceDoc);

  return deviceDoc;
}

/*
 * Reassigns an existing device's customer/course/location. Permanent
 * device_id is never changed. Keeps legacy `active`, `hole`, and
 * `course_name` fields in sync so current request ingestion in index.js
 * continues to work unmodified.
 */
async function updateDeviceAssignment(db, deviceId, {
  customerId,
  courseId,
  courseName,
  location,
} = {}) {
  const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
  const deviceSnap = await deviceRef.get();
  if (!deviceSnap.exists) {
    throw new Error(`Unknown device_id: ${deviceId}`);
  }

  if (location !== undefined && location !== null && !isValidMarkerLocation(location)) {
    throw new Error('Invalid marker location');
  }

  const current = deviceSnap.data();
  const nextLocation = location !== undefined ? location : current.location;

  const update = {
    customer_id: customerId !== undefined ? customerId : current.customer_id,
    course_id: courseId !== undefined ? courseId : current.course_id,
    course_name: courseName !== undefined ? courseName : current.course_name,
    location: nextLocation,
    updated_at: new Date(),
    ...buildLegacyCompatibilityFields(current.state, nextLocation),
  };

  await deviceRef.update(update);

  return { ...current, ...update };
}

/*
 * Transitions a device between canonical states (In Inventory / Deployed /
 * Maintenance / Retired). There is no delete workflow; Retired devices
 * remain permanently in the collection.
 */
async function updateDeviceState(db, deviceId, nextState) {
  if (!isValidDeviceState(nextState)) {
    throw new Error(`Invalid device state: ${nextState}`);
  }

  const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
  const deviceSnap = await deviceRef.get();
  if (!deviceSnap.exists) {
    throw new Error(`Unknown device_id: ${deviceId}`);
  }

  const current = deviceSnap.data();

  const update = {
    state: nextState,
    updated_at: new Date(),
    ...buildLegacyCompatibilityFields(nextState, current.location),
  };

  await deviceRef.update(update);

  return { ...current, ...update };
}

/*
 * Backward-compatible device lookup mirroring the exact fields index.js's
 * createButtonRequest() already reads (active, course_id, course_name,
 * hole, label). Provided for future reuse by WP3/WP4/WP5 code; the current
 * live Cloud Function still performs its own inline lookup and is
 * unmodified by WP2.
 */
async function getDeviceForRequestIngestion(db, deviceId) {
  const deviceSnap = await db.collection(DEVICES_COLLECTION).doc(deviceId).get();

  if (!deviceSnap.exists) {
    return null;
  }

  const device = deviceSnap.data();

  return {
    active: device.active,
    course_id: device.course_id,
    course_name: device.course_name,
    hole: device.hole,
    label: device.label,
  };
}

module.exports = {
  DEVICES_COLLECTION,
  createDevice,
  updateDeviceAssignment,
  updateDeviceState,
  getDeviceForRequestIngestion,
};
