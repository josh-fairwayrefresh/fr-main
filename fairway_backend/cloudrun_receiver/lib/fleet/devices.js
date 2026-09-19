'use strict';

const {
  ID_PREFIXES,
  DEVICE_STATES,
  isValidDeviceState,
  isDeviceCommunicationAllowed,
  isValidMarkerLocation,
  deriveHoleFromLocation,
  deriveDisplayLabelFromLocation,
} = require('./schema');
const { allocateNextId } = require('./ids');
const { getCustomer } = require('./customers');
const { getCourseForCustomer } = require('./courses');
const { generateDeviceCredential, verifyDeviceCredential } = require('./credentials');

const DEVICES_COLLECTION = 'devices';

/*
 * Device schema. The canonical permanent identity is the Firestore document
 * ID itself (devices/{FRB-XXXX}); it is not duplicated as a `device_id`
 * field inside the document. `location` is the single source of marker
 * placement (no independent `hole`/`label` fields); `state` is the single
 * source of administrative lifecycle (no independent `active` field) and
 * backend communication permission is always derived from it via
 * isDeviceCommunicationAllowed().
 *
 *   state                 canonical DEVICE_STATES value (in_inventory,
 *                         deployed, maintenance, retired); no delete workflow
 *   customer_id            owning Customer; authoritative, set once and not
 *                          changed by normal Course reassignment (no
 *                          cross-Customer transfer workflow)
 *   customer_name          synchronized display copy of the owning
 *                          Customer's `customer_name`; never independently
 *                          editable, always sourced from the Customer record
 *   course_id              current Course assignment within that Customer,
 *                          mutable
 *   course_name            synchronized display copy of the assigned
 *                          Course's `course_name`; never independently
 *                          editable, always sourced from the Course record
 *   location                { type: 'hole', hole: 1-18 } or
 *                          { type: 'custom', name: string }; hole number and
 *                          display text are always derived from this field
 *                          (see deriveHoleFromLocation/
 *                          deriveDisplayLabelFromLocation in ./schema);
 *                          future GPS fields can be added to this object
 *                          later without a breaking schema change
 *   comments                administrator free-text notes
 *   sim_iccid                SIM ICCID association (string or null)
 *   hardware_revision       e.g. "Prototype 1.2" (string or null)
 *   firmware_generation     e.g. "LP 1.2" (string or null)
 *   commissioning           { commissioned_at, commissioned_by } or null
 *   service                 { last_service_at, last_service_by } or null
 *   credential              { algorithm: 'sha256', digest: <hex>,
 *                          updated_at } or null until a credential has been
 *                          issued/replaced (see replaceDeviceCredential());
 *                          only the non-reversible verifier is ever stored,
 *                          never the plaintext secret
 *   latest_health           placeholder for WP4; null until WP4 implements it
 *   gps                     placeholder for a future GPS extension; null
 *   created_at / updated_at  standard metadata
 */

/*
 * Creates a Device document. Per CPO direction, a physical marker receives
 * its FRB id only after build/test reaches "Ready for Deployment"; this is
 * the backend primitive the future Admin "Add Device" workflow (WP5) will
 * call at that point. It is not wired into any exposed route in WP2/WP3.
 * The returned object includes `device_id` for caller convenience only; the
 * persisted Firestore document itself does not contain that field.
 *
 * customer_name/course_name are always sourced from the authoritative
 * Customer/Course records; the caller cannot supply arbitrary display names.
 * A Device may be created without a Customer/Course assignment (In
 * Inventory) and assigned later via updateDeviceAssignment().
 */
async function createDevice(db, {
  customerId = null,
  courseId = null,
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
  if (courseId && !customerId) {
    throw new Error('customerId is required when assigning a course');
  }

  let customerName = null;
  if (customerId) {
    const customer = await getCustomer(db, customerId);
    if (!customer) {
      throw new Error(`Unknown customer_id: ${customerId}`);
    }
    customerName = customer.customer_name;
  }

  let courseName = null;
  if (courseId) {
    const course = await getCourseForCustomer(db, customerId, courseId);
    if (!course) {
      throw new Error(`Course ${courseId} does not belong to customer ${customerId}`);
    }
    courseName = course.course_name;
  }

  const deviceId = await allocateNextId(db, ID_PREFIXES.DEVICE);
  const now = new Date();

  const deviceDoc = {
    state,
    customer_id: customerId,
    customer_name: customerName,
    course_id: courseId,
    course_name: courseName,
    location,
    comments,
    sim_iccid: simIccid,
    hardware_revision: hardwareRevision,
    firmware_generation: firmwareGeneration,
    commissioning: null,
    service: null,
    credential: null,
    latest_health: null,
    gps: null,
    created_at: now,
    updated_at: now,
  };

  await db.collection(DEVICES_COLLECTION).doc(deviceId).set(deviceDoc);

  return { device_id: deviceId, ...deviceDoc };
}

/*
 * Reassigns an existing device's Course/location, and/or sets its Customer
 * for the first time. Permanent identity (the Firestore document ID) is
 * never changed. Per CPO policy, customer_id is set once and then stable:
 * once a device has a customer_id, this function rejects any attempt to
 * change it (no cross-Customer transfer workflow); normal reassignment only
 * moves a device between Courses belonging to its existing Customer. A
 * selected Course must belong to the device's Customer. customer_name/
 * course_name are always re-derived from the authoritative Customer/Course
 * records; the caller cannot supply arbitrary display names.
 */
async function updateDeviceAssignment(db, deviceId, {
  customerId,
  courseId,
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
  const update = { updated_at: new Date() };

  if (location !== undefined) {
    update.location = location;
  }

  let effectiveCustomerId = current.customer_id;

  if (customerId !== undefined && customerId !== current.customer_id) {
    if (current.customer_id) {
      throw new Error(
        `Device ${deviceId} is already assigned to customer ${current.customer_id}; cross-customer reassignment is not supported`
      );
    }

    const customer = await getCustomer(db, customerId);
    if (!customer) {
      throw new Error(`Unknown customer_id: ${customerId}`);
    }

    update.customer_id = customerId;
    update.customer_name = customer.customer_name;
    effectiveCustomerId = customerId;
  }

  if (courseId !== undefined) {
    if (courseId === null) {
      update.course_id = null;
      update.course_name = null;
    } else {
      if (!effectiveCustomerId) {
        throw new Error('Device must be assigned to a customer before a course can be assigned');
      }

      const course = await getCourseForCustomer(db, effectiveCustomerId, courseId);
      if (!course) {
        throw new Error(`Course ${courseId} does not belong to customer ${effectiveCustomerId}`);
      }

      update.course_id = courseId;
      update.course_name = course.course_name;
    }
  }

  await deviceRef.update(update);

  return { device_id: deviceId, ...current, ...update };
}

/*
 * Transitions a device between canonical states (In Inventory / Deployed /
 * Maintenance / Retired). There is no delete workflow; Retired devices
 * remain permanently in the collection. Backend communication permission is
 * always derived from `state` (isDeviceCommunicationAllowed); no separate
 * `active` field is stored or updated.
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
  };

  await deviceRef.update(update);

  return { device_id: deviceId, ...current, ...update };
}

/*
 * Canonical device lookup for building new request-event documents. Returns
 * the fields index.js needs, deriving `hole`/`device_label` from the
 * canonical `location` field rather than reading independent duplicate
 * fields. Communication permission is exposed pre-derived from `state`.
 * Provided for future reuse by WP4/WP5 code; the current live Cloud
 * Function performs its own equivalent inline derivation.
 */
async function getDeviceForRequestIngestion(db, deviceId) {
  const deviceSnap = await db.collection(DEVICES_COLLECTION).doc(deviceId).get();

  if (!deviceSnap.exists) {
    return null;
  }

  const device = deviceSnap.data();

  return {
    communication_allowed: isDeviceCommunicationAllowed(device.state),
    course_id: device.course_id,
    course_name: device.course_name,
    hole: deriveHoleFromLocation(device.location),
    device_label: deriveDisplayLabelFromLocation(device.location),
  };
}

/*
 * Issues a new credential for an existing device, replacing any previous one
 * for the SAME permanent device_id. Used both for a device's initial
 * credential (immediately after createDevice) and for later replacement; the
 * FRB identity itself is never changed. Returns the plaintext secret exactly
 * once; only the verifier is persisted to Firestore. No credential history
 * or routine rotation is implemented.
 */
async function replaceDeviceCredential(db, deviceId) {
  const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
  const deviceSnap = await deviceRef.get();
  if (!deviceSnap.exists) {
    throw new Error(`Unknown device_id: ${deviceId}`);
  }

  const { secret, verifier } = generateDeviceCredential();

  await deviceRef.update({
    credential: verifier,
    updated_at: new Date(),
  });

  return { device_id: deviceId, secret };
}

/*
 * Live request-authentication lookup: retrieves exactly the fields needed to
 * bind a presented credential to the exact claimed device_id and to enforce
 * the backend-access policy (Retired denies; In Inventory/Deployed/
 * Maintenance allow), without exposing any other device fields. `device_id`
 * is derived from the document ID (the query parameter), never read from a
 * stored field.
 */
async function getDeviceForAuthentication(db, deviceId) {
  const deviceSnap = await db.collection(DEVICES_COLLECTION).doc(deviceId).get();

  if (!deviceSnap.exists) {
    return null;
  }

  const device = deviceSnap.data();

  return {
    device_id: deviceId,
    communication_allowed: isDeviceCommunicationAllowed(device.state),
    credential: device.credential,
  };
}

/*
 * Verifies a presented plaintext secret against the exact claimed device's
 * stored credential verifier. A credential belonging to one device can never
 * verify against another device's record, since the verifier is always
 * looked up strictly by the claimed device_id.
 */
function authenticateDeviceCredential(device, presentedSecret) {
  if (!device) {
    return false;
  }

  return verifyDeviceCredential(presentedSecret, device.credential);
}

module.exports = {
  DEVICES_COLLECTION,
  createDevice,
  updateDeviceAssignment,
  updateDeviceState,
  getDeviceForRequestIngestion,
  replaceDeviceCredential,
  getDeviceForAuthentication,
  authenticateDeviceCredential,
};
