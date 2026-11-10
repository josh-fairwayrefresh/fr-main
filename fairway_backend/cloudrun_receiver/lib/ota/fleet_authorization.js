'use strict';

const crypto = require('crypto');
const { isDeviceCommunicationAllowed } = require('../fleet/schema');
const { isValidIanaTimezone } = require('../fleet/courses');
const { PUBLICATION_APPROVALS, publicationEligible } = require('./publication_policy');

const TERMINAL = new Set(['confirmed', 'failed', 'rolled_back']);
const MAX_SELECTION = 50;
const HEADQUARTERS_TIME_ZONE = 'America/Los_Angeles';

function createFleetAuthorization(db, {
  now, nextWindow, OtaError, hardwareId, fingerprint,
  acceptedReleases, approvals = PUBLICATION_APPROVALS,
  headquartersTimeZone = HEADQUARTERS_TIME_ZONE,
}) {
  const devices = db.collection('devices');
  const assignments = db.collection('ota_assignments');
  const deployments = db.collection('ota_deployments');
  const releases = db.collection('ota_releases');
  const reviews = db.collection('ota_authorization_reviews');

  function requireRelease(releaseId, release) {
    if (!release || release.state !== 'published') {
      throw new OtaError('release_unavailable', 'Choose a published firmware update.', 409);
    }
    if (!publicationEligible(releaseId, release.sha256, approvals)
        || release.sha256 !== acceptedReleases[releaseId]
        || release.provenance?.signing_fingerprint !== fingerprint
        || !release.hardware_ids?.includes(hardwareId)) {
      throw new OtaError('release_not_eligible', 'Release publication prerequisites are incomplete.', 409);
    }
  }

  function capabilityError(device, releaseId) {
    if (!isDeviceCommunicationAllowed(device.state)) return 'Device lifecycle does not permit OTA.';
    const capability = device.ota_capability;
    if (capability?.verified !== true || !capability.evidence_record
        || capability.hardware_id !== hardwareId
        || capability.signing_fingerprint !== fingerprint
        || !['one_time', 'nightly'].includes(capability.schedule_mode)) {
      return 'Verified physical OTA initialization and compatible trust anchor are required.';
    }
    if (releaseId && !approvals[releaseId]?.device_ids?.includes(device.device_id)) {
      return 'This device is outside the release commissioning authorization.';
    }
    if (capability.schedule_mode === 'one_time'
        && (device.device_id !== 'FRB-0005' || releaseId && releaseId !== 'OTA-0.1alt')) {
      return 'The bootstrap exception is restricted to FRB-0005 receiving OTA 0.1alt.';
    }
    return null;
  }

  async function resolve(deviceId, read, releaseId = null) {
    const deviceSnap = await read(devices.doc(deviceId));
    if (!deviceSnap.exists) throw new OtaError('unknown_device', `Unknown device ${deviceId}.`, 404);
    const statusSnap = await read(db.collection('ota_device_status').doc(deviceId));
    const status = statusSnap.exists ? statusSnap.data() : {};
    const device = { ...deviceSnap.data(), device_id: deviceId };
    if (device.ota_capability && status.confirmed_schedule_mode === 'nightly') {
      device.ota_capability = { ...device.ota_capability, schedule_mode: 'nightly' };
    }
    const reason = capabilityError(device, releaseId);
    if (reason) throw new OtaError('device_not_eligible', `${deviceId}: ${reason}`, 409);
    let zone = headquartersTimeZone;
    let customerName = null;
    let courseName = null;
    if (device.state === 'deployed') {
      if (!device.customer_id || !device.course_id) {
        throw new OtaError('invalid_deployment', `${deviceId} has no canonical Course assignment.`, 409);
      }
      const customer = await read(db.collection('customers').doc(device.customer_id));
      const course = await read(db.collection('customers').doc(device.customer_id)
        .collection('courses').doc(device.course_id));
      if (!customer.exists || !course.exists) {
        throw new OtaError('invalid_deployment', `${deviceId} references a missing Customer or Course.`, 409);
      }
      zone = course.data().timezone;
      customerName = customer.data().customer_name;
      courseName = course.data().course_name;
    }
    if (!isValidIanaTimezone(zone)) {
      throw new OtaError('timezone_unresolved', `${deviceId}: ${device.state === 'deployed'
        ? 'Course' : 'CPO-confirmed headquarters'} IANA time zone is required.`, 409);
    }
    const assignmentSnap = await read(assignments.doc(deviceId));
    let pending = null;
    let last = null;
    if (assignmentSnap.exists) {
      const snap = await read(deployments.doc(assignmentSnap.data().deployment_id));
      if (!snap.exists) throw new OtaError('invalid_assignment', `${deviceId} has an unresolved assignment.`, 409);
      last = { ...snap.data(), deployment_id: snap.id };
      if (!TERMINAL.has(last.state)) pending = last;
    }
    const bootstrap = device.ota_capability.schedule_mode === 'one_time';
    const basis = {
      device_id: deviceId, state: device.state,
      customer_id: device.state === 'deployed' ? device.customer_id : null,
      course_id: device.state === 'deployed' ? device.course_id : null,
      timezone: zone, capability: device.ota_capability,
    };
    return {
      ...basis, customer_name: customerName, course_name: courseName,
      basis_hash: crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex'),
      next_window: bootstrap ? null : nextWindow(zone, now()).toISOString(),
      schedule: bootstrap ? 'bootstrap_900_seconds' : 'nightly_0030',
      pending, last_result: last,
      confirmed_firmware_version: status.confirmed_firmware_version || null,
      last_check_at: status.last_check_at || null,
      bootstrap_check_observed: bootstrap && !!status.last_check_at,
    };
  }

  async function listFleet() {
    const [customerSnaps, deviceSnaps] = await Promise.all([
      db.collection('customers').get(), devices.get(),
    ]);
    const customers = await Promise.all(customerSnaps.docs.map(async (snap) => ({
      customer_id: snap.id, customer_name: snap.data().customer_name,
      courses: (await snap.ref.collection('courses').get()).docs.map((course) => ({
        course_id: course.id, course_name: course.data().course_name, timezone: course.data().timezone,
      })),
    })));
    const fleet = await Promise.all(deviceSnaps.docs.filter((snap) => snap.data().state !== 'retired')
      .map(async (snap) => {
        const source = snap.data();
        const base = {
          device_id: snap.id, state: source.state,
          customer_id: source.state === 'deployed' ? source.customer_id : null,
          course_id: source.state === 'deployed' ? source.course_id : null,
        };
        try {
          const value = await resolve(snap.id, (ref) => ref.get());
          const { capability, basis_hash, ...safe } = value;
          return { ...safe, eligible: !value.pending && !value.bootstrap_check_observed,
            reason: value.pending && value.pending.basis_hash !== value.basis_hash
              ? 'Placement, trust or scheduling changed after authorization; delivery is blocked pending engineering reconciliation.'
              : value.pending ? 'An active assignment already exists.'
              : value.bootstrap_check_observed ? 'The one-time commissioning check was already observed.' : null };
        } catch (error) {
          if (!(error instanceof OtaError)) throw error;
          const [status, assignment] = await Promise.all([
            db.collection('ota_device_status').doc(snap.id).get(), assignments.doc(snap.id).get(),
          ]);
          const lastSnap = assignment.exists ? await deployments.doc(assignment.data().deployment_id).get() : null;
          const last = lastSnap?.exists ? lastSnap.data() : null;
          return { ...base, eligible: false, reason: error.message,
            confirmed_firmware_version: status.exists ? status.data().confirmed_firmware_version || null : null,
            last_check_at: status.exists ? status.data().last_check_at || null : null,
            pending: last && !TERMINAL.has(last.state) ? last : null, last_result: last };
        }
      }));
    return { customers, devices: fleet, headquarters_timezone: headquartersTimeZone,
      headquarters_timezone_status: isValidIanaTimezone(headquartersTimeZone) ? 'configured' : 'unavailable',
      max_selection: MAX_SELECTION };
  }

  function validateSelection(body) {
    if (!body || typeof body.release_id !== 'string'
        || !Object.hasOwn(acceptedReleases, body.release_id) || !Array.isArray(body.device_ids)
        || body.device_ids.length === 0 || body.device_ids.length > MAX_SELECTION
        || new Set(body.device_ids).size !== body.device_ids.length
        || body.device_ids.some((id) => typeof id !== 'string' || !/^FRB-\d{4}$/.test(id))
        || Object.keys(body).some((key) => !['release_id', 'device_ids'].includes(key))) {
      throw new OtaError('invalid_selection', `Select 1-${MAX_SELECTION} exact, unique device IDs and one release.`);
    }
  }

  async function prepare(body, uid) {
    validateSelection(body);
    return db.runTransaction(async (tx) => {
      const releaseSnap = await tx.get(releases.doc(body.release_id));
      const release = releaseSnap.exists ? releaseSnap.data() : null;
      requireRelease(body.release_id, release);
      const selected = [];
      for (const id of [...body.device_ids].sort()) {
        const device = await resolve(id, (ref) => tx.get(ref), body.release_id);
        if (device.pending || device.bootstrap_check_observed) {
          throw new OtaError('active_or_consumed', `${id}: pending assignment or consumed bootstrap check.`, 409);
        }
        selected.push(device);
      }
      const id = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + 5 * 60000);
      tx.set(reviews.doc(id), {
        admin_uid: uid, release_id: body.release_id, release_sha256: release.sha256,
        devices: selected, expires_at: expiresAt, state: 'review',
      });
      return { review_id: id, release_id: body.release_id, devices: selected,
        expires_at: expiresAt.toISOString() };
    });
  }

  async function confirm(reviewId, uid) {
    if (typeof reviewId !== 'string' || !/^[a-f0-9-]{36}$/.test(reviewId)) {
      throw new OtaError('invalid_review', 'A current authorization review is required.');
    }
    return db.runTransaction(async (tx) => {
      const reviewRef = reviews.doc(reviewId);
      const snap = await tx.get(reviewRef);
      if (!snap.exists || snap.data().admin_uid !== uid) {
        throw new OtaError('invalid_review', 'This authorization review is unavailable.', 403);
      }
      const review = snap.data();
      if (review.state === 'assigned') return review.result;
      const expiry = review.expires_at?.toDate ? review.expires_at.toDate() : review.expires_at;
      if (!(expiry instanceof Date) || expiry <= now()) {
        throw new OtaError('review_expired', 'Review expired. Review the exact devices again.', 409);
      }
      const releaseSnap = await tx.get(releases.doc(review.release_id));
      const release = releaseSnap.exists ? releaseSnap.data() : null;
      requireRelease(review.release_id, release);
      if (release.sha256 !== review.release_sha256) throw new OtaError('review_changed', 'Release changed.', 409);
      const verified = [];
      for (const previous of review.devices) {
        const device = await resolve(previous.device_id, (ref) => tx.get(ref), review.release_id);
        if (device.pending || device.bootstrap_check_observed
            || device.basis_hash !== previous.basis_hash
            || device.next_window !== previous.next_window) {
          throw new OtaError('review_changed', `${device.device_id} eligibility or window changed; review again.`, 409);
        }
        verified.push(device);
      }
      const assignedAt = now();
      const result = { authorization_id: reviewId, release_id: review.release_id, assignments: [] };
      for (const device of verified) {
        const ref = deployments.doc(crypto.randomUUID());
        const notBefore = device.schedule === 'bootstrap_900_seconds' ? assignedAt : new Date(device.next_window);
        const assignment = {
          deployment_id: ref.id, device_id: device.device_id, release_id: review.release_id,
          assigned_by: uid, assigned_at: assignedAt, not_before: notBefore,
          timezone: device.timezone, schedule: device.schedule, authorization_id: reviewId,
          basis_hash: device.basis_hash,
        };
        tx.set(assignments.doc(device.device_id), assignment);
        tx.set(ref, {
          ...assignment, version_string: release.version_string, state: 'assigned',
          created_at: assignedAt, updated_at: assignedAt, firmware_version: null, error_code: null,
          last_check_at: null, offered_at: null, artifact_requested_at: null,
        });
        tx.set(ref.collection('events').doc('assigned'), { ...assignment, state: 'assigned', created_at: assignedAt });
        result.assignments.push({ device_id: device.device_id, deployment_id: ref.id,
          not_before: notBefore.toISOString(), schedule: device.schedule });
      }
      tx.update(reviewRef, { state: 'assigned', result, authorized_at: assignedAt });
      return result;
    });
  }

  return { listFleet, prepare, confirm, requireRelease, resolve, capabilityError };
}

module.exports = { createFleetAuthorization, HEADQUARTERS_TIME_ZONE };
