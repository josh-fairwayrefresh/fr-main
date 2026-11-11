'use strict';

const crypto = require('crypto');
const { ACCEPTED_RELEASES, PRODUCTION_FINGERPRINT } = require('./accepted_releases');
const { PUBLICATION_APPROVALS, RELEASE_BLOCKERS, publicationEligible } = require('./publication_policy');
const { createFleetAuthorization, HEADQUARTERS_TIME_ZONE } = require('./fleet_authorization');

const HARDWARE_ID = 'circuitdojo_feather_nrf9151@1/nrf9151/ns';
const MCUBOOT_SECONDARY_SLOT_BYTES = 0x6c000;
const MAX_SIGNED_IMAGE_BYTES = 0x6a000;
const RELEASE_ID_PATTERN = /^OTA-(?:0\.1|(?:0\.1alt|1\.0)(?:-r[23])?)$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+\+\d+$/;
const RELEASE_VERSIONS = Object.freeze({
  'OTA-0.1': '0.1.0+1',
  'OTA-0.1alt': '0.1.0+2',
  'OTA-1.0': '1.0.0+1',
  'OTA-0.1alt-r2': '0.1.0+3',
  'OTA-0.1-r3': '0.1.0+4',
  'OTA-0.1alt-r3': '0.1.0+5',
  'OTA-1.0-r2': '1.0.0+2',
  'OTA-1.0-r3': '1.0.0+3',
});
const TERMINAL_STATES = new Set(['confirmed', 'failed', 'rolled_back']);
const UPDATE_STATES = new Set([
  'downloading',
  'verifying',
  'staged',
  'activation_pending',
  'trial_boot',
  'confirmed',
  'rolled_back',
  'failed',
]);
const STATE_TRANSITIONS = Object.freeze({
  assigned: new Set(['downloading', 'failed']),
  downloading: new Set(['verifying', 'failed']),
  verifying: new Set(['staged', 'failed']),
  staged: new Set(['activation_pending', 'failed']),
  activation_pending: new Set(['trial_boot', 'failed', 'rolled_back']),
  trial_boot: new Set(['confirmed', 'failed', 'rolled_back']),
  confirmed: new Set(),
  failed: new Set(),
  rolled_back: new Set(),
});
const DOWNLOAD_TOKEN_LIFETIME_MS = 30 * 60 * 1000;

class OtaError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'OtaError';
    this.code = code;
    this.status = status;
  }
}

function asDate(value) {
  const date = value instanceof Date ? value : value?.toDate?.();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

function isSafeVersion(version) {
  return version && Number.isInteger(version.major) && version.major >= 0 && version.major <= 255
    && Number.isInteger(version.minor) && version.minor >= 0 && version.minor <= 255
    && Number.isInteger(version.revision) && version.revision >= 0 && version.revision <= 65535
    && Number.isInteger(version.build) && version.build >= 0 && version.build <= 0xffffffff;
}

function nextCourseCheckTime(timeZone, now) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const getParts = (date) => Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  const localNow = getParts(now);
  const todayBeforeCheck = localNow.hour === 0 && localNow.minute < 30;

  for (let dayOffset = todayBeforeCheck ? 0 : 1; dayOffset < 4; dayOffset += 1) {
    const date = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + dayOffset));
    const targetLocal = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      30,
      0,
      0
    );
    let candidateUtc = targetLocal;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const actual = getParts(new Date(candidateUtc));
      const actualAsUtc = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute
      );
      candidateUtc += targetLocal - actualAsUtc;
    }
    if (candidateUtc > now.getTime()) return new Date(candidateUtc);
  }
  throw new OtaError('course_timezone_unavailable', 'Could not calculate the next Course-local OTA check.', 422);
}

function validateArtifact(body, acceptedReleases = ACCEPTED_RELEASES,
  publicationApprovals = PUBLICATION_APPROVALS) {
  const { release_id: releaseId, version, hardware_ids: hardwareIds } = body || {};
  const encoded = body?.artifact_base64;
  const expectedDigest = body?.sha256;
  const notes = body?.notes ?? '';
  if (releaseId === 'OTA-0.1' || releaseId === 'OTA-0.1-r3') {
    throw new OtaError('physical_initialization_only', 'OTA 0.1 is USB-only initialization, never an OTA update.');
  }

  if (typeof releaseId !== 'string' || !RELEASE_ID_PATTERN.test(releaseId)) {
    throw new OtaError('invalid_release_id', 'Release ID must identify a supported immutable OTA release.');
  }
  const expectedVersion = isSafeVersion(version)
    ? `${version.major}.${version.minor}.${version.revision}+${version.build}`
    : null;
  if (!expectedVersion || typeof body.version_string !== 'string'
      || !VERSION_PATTERN.test(body.version_string)
      || body.version_string !== expectedVersion
      || body.version_string !== RELEASE_VERSIONS[releaseId]) {
    throw new OtaError('invalid_version', 'Release semantic version metadata is invalid.');
  }
  if (!Array.isArray(hardwareIds) || hardwareIds.length !== 1 || hardwareIds[0] !== HARDWARE_ID) {
    throw new OtaError('unsupported_hardware', 'Release must target the Circuit Dojo nRF9151 Feather.');
  }
  if (typeof encoded !== 'string' || encoded.length === 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new OtaError('invalid_artifact', 'A base64 signed MCUboot image is required.');
  }
  const artifact = Buffer.from(encoded, 'base64');
  if (artifact.toString('base64') !== encoded || artifact.length < 32
      || artifact.length > MAX_SIGNED_IMAGE_BYTES
      || artifact.subarray(0, 4).compare(Buffer.from([0x3d, 0xb8, 0xf3, 0x96])) !== 0) {
    throw new OtaError('invalid_artifact', 'Artifact is not a valid-sized MCUboot image for this slot.');
  }
  const imageVersion = {
    major: artifact[20],
    minor: artifact[21],
    revision: artifact.readUInt16LE(22),
    build: artifact.readUInt32LE(24),
  };
  if (imageVersion.major !== version.major || imageVersion.minor !== version.minor
      || imageVersion.revision !== version.revision || imageVersion.build !== version.build) {
    throw new OtaError('invalid_version', 'Signed MCUboot image version does not match release metadata.');
  }
  const digest = crypto.createHash('sha256').update(artifact).digest('hex');
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)
      || digest !== expectedDigest) {
    throw new OtaError('artifact_digest_mismatch', 'Artifact SHA-256 does not match the supplied digest.');
  }
  if (typeof notes !== 'string' || notes.length > 1000) {
    throw new OtaError('invalid_notes', 'Release notes must be 1000 characters or fewer.');
  }
  const manifest = body.manifest;
  const successor = /-r[23]$/.test(releaseId);
  const sourceCommit = successor ? publicationApprovals[releaseId]?.build_base_commit
    : '2d72b5de401b3faecb09a5e86a5410156692d18e';
  const sourceDigest = successor ? publicationApprovals[releaseId]?.build_source_sha256
    : '6c786dd3257d5c05c4b792fa3d33f90d6473a790036dbc1377f886395433040c';
  if (acceptedReleases[releaseId] !== digest) {
    throw new OtaError('release_not_accepted', 'Image bytes do not match the CPO-accepted production release.');
  }
  if (!manifest || manifest.release_id !== releaseId || manifest.version_string !== expectedVersion
      || manifest.sha256 !== digest || manifest.size_bytes !== artifact.length
      || manifest.board !== HARDWARE_ID || manifest.device_credentials_embedded !== false
      || manifest.signing?.fingerprint !== PRODUCTION_FINGERPRINT
      || manifest.generated_mcuboot_public_key_fingerprint !== PRODUCTION_FINGERPRINT
      || !/^[a-f0-9]{64}$/.test(sourceDigest || '')
      || !/^[a-f0-9]{40}$/.test(sourceCommit || '')
      || manifest.build_source_sha256 !== sourceDigest
      || manifest.source_commit !== sourceCommit
      || (successor && manifest.generated_image_capacity?.max_signed_image_bytes !== MAX_SIGNED_IMAGE_BYTES)
      || manifest.signing.algorithm !== 'ECDSA-P256'
      || manifest.signing.private_key_in_artifacts !== false
      || manifest.ncs_version !== '3.1.1') {
    throw new OtaError('invalid_provenance', 'The original production release manifest is required and must match the image.');
  }
  return {
    releaseId,
    version,
    versionString: body.version_string,
    hardwareIds,
    artifact,
    digest,
    notes: notes.trim(),
    provenance: {
      signing_fingerprint: PRODUCTION_FINGERPRINT,
      source_commit: manifest.source_commit,
      build_source_sha256: manifest.build_source_sha256,
      source_worktree_dirty: manifest.source_worktree_dirty === true,
      approval: 'cpo_accepted_signature_verified_bytes',
    },
  };
}

function eventDocumentId(state, firmwareVersion, errorCode) {
  return crypto.createHash('sha256')
    .update(`${state}\n${firmwareVersion}\n${errorCode}`)
    .digest('hex')
    .slice(0, 32);
}

function createOtaService(db, {
  artifactStore, now = () => new Date(), acceptedReleases = ACCEPTED_RELEASES,
  publicationApprovals = PUBLICATION_APPROVALS,
  headquartersTimeZone = HEADQUARTERS_TIME_ZONE,
  artifactDeliveryEnabled = false,
} = {}) {
  const releases = db.collection('ota_releases');
  const deployments = db.collection('ota_deployments');
  const assignments = db.collection('ota_assignments');
  const fleet = createFleetAuthorization(db, {
    now, nextWindow: nextCourseCheckTime, OtaError, hardwareId: HARDWARE_ID,
    maxImageBytes: MAX_SIGNED_IMAGE_BYTES,
    fingerprint: PRODUCTION_FINGERPRINT, acceptedReleases,
    approvals: publicationApprovals, headquartersTimeZone,
  });

  function requireArtifactStore() {
    if (!artifactStore) {
      throw new OtaError('artifact_storage_unavailable', 'OTA artifact storage is not configured.', 503);
    }
  }

  function requireArtifactDelivery() {
    if (artifactDeliveryEnabled !== true) {
      throw new OtaError('artifact_delivery_disabled',
        'Artifact delivery is disabled pending verified credential logging protections.', 503);
    }
  }

  async function listReleases() {
    const snapshot = await releases.orderBy('created_at', 'desc').limit(100).get();
    return Promise.all(snapshot.docs.filter((doc) => !['OTA-0.1', 'OTA-0.1-r3'].includes(doc.id)).map(async (doc) => {
      let assignable = true;
      try {
        await fleet.requireSelectableRelease(doc.id, doc.data(), (ref) => ref.get());
      } catch (error) {
        if (!(error instanceof OtaError)) throw error;
        assignable = false;
      }
      return {
        ...doc.data(), release_id: doc.id, assignable,
        approval_status: assignable ? 'Approved and published' : 'Release unavailable or publication prerequisites incomplete',
        authorized_device_ids: publicationApprovals[doc.id]?.device_ids || [],
      };
    }));
  }

  async function listDeployments() {
    const snapshot = await deployments.orderBy('created_at', 'desc').limit(200).get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), deployment_id: doc.id }));
  }

  async function registerRelease(body, adminUid) {
    requireArtifactStore();
    const release = validateArtifact(body, acceptedReleases, publicationApprovals);
    if (!publicationEligible(release.releaseId, release.digest, publicationApprovals)) {
      release.artifact.fill(0);
      throw new OtaError('publication_not_authorized', RELEASE_BLOCKERS.join(' '), 409);
    }
    const releaseRef = releases.doc(release.releaseId);
    const objectPath = `ota/releases/${release.releaseId}/${release.digest}.bin`;
    const createdAt = now();
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(releaseRef);
      if (current.exists && (current.data().state !== 'publish_failed'
          || current.data().sha256 !== release.digest)) {
        throw new OtaError('release_exists', 'A release with this ID is already registered.', 409);
      }
      transaction.set(releaseRef, {
        release_id: release.releaseId,
        version: release.version,
        version_string: release.versionString,
        hardware_ids: release.hardwareIds,
        sha256: release.digest,
        size_bytes: release.artifact.length,
        object_path: objectPath,
        notes: release.notes,
        provenance: release.provenance,
        publication_evidence: publicationApprovals[release.releaseId],
        schedule_mode: 'nightly',
        state: 'publishing',
        created_at: createdAt,
        created_by: adminUid,
      });
    });

    try {
      await artifactStore.upload(objectPath, release.artifact, {
        sha256: release.digest,
        release_id: release.releaseId,
      });
      await releaseRef.update({ state: 'published', published_at: now() });
    } catch {
      console.error(`OTA publication failed for ${release.releaseId}; artifact_upload_failed`);
      await releaseRef.update({ state: 'publish_failed', publish_error: 'artifact_upload_failed' });
      throw new OtaError('artifact_upload_failed', 'The artifact could not be stored.', 503);
    } finally {
      release.artifact.fill(0);
    }
    return { release_id: release.releaseId, state: 'published', sha256: release.digest };
  }

  async function assignRelease(deviceId, releaseId, adminUid, notBefore = null) {
    throw new OtaError('assignment_review_required', 'Use exact-device review and confirmation; direct assignment is disabled.', 409);
  }

  async function getCourseTimeZone(device) {
    if (['in_inventory', 'maintenance'].includes(device.state)) {
      if (!headquartersTimeZone) {
        throw new OtaError('headquarters_timezone_unresolved', 'CPO-confirmed headquarters time zone is not configured.', 409);
      }
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: headquartersTimeZone });
      } catch (_error) {
        throw new OtaError('headquarters_timezone_unresolved', 'Headquarters IANA time zone is invalid.', 409);
      }
      return headquartersTimeZone;
    }
    if (typeof device.customer_id !== 'string' || typeof device.course_id !== 'string') {
      throw new OtaError('course_assignment_required', 'OTA scheduling requires an assigned Course.', 422);
    }
    const courseRef = db.collection('customers').doc(device.customer_id)
      .collection('courses').doc(device.course_id);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists || typeof courseSnap.data().timezone !== 'string') {
      throw new OtaError('course_timezone_required', 'The assigned Course needs a valid IANA timezone.', 422);
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: courseSnap.data().timezone });
    } catch (_error) {
      throw new OtaError('course_timezone_required', 'The assigned Course timezone is invalid.', 422);
    }
    return courseSnap.data().timezone;
  }

  async function getNextCheck(device) {
    const timeZone = await getCourseTimeZone(device);
    return nextCourseCheckTime(timeZone, now()).getTime();
  }

  async function issueDownloadToken(deploymentId, deviceId, release) {
    requireArtifactDelivery();
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(now().getTime() + DOWNLOAD_TOKEN_LIFETIME_MS);
    await db.collection('ota_download_tokens').doc(tokenHash).set({
      device_id: deviceId,
      deployment_id: deploymentId,
      release_id: release.release_id,
      object_path: release.object_path,
      expires_at: expiresAt,
      created_at: now(),
    });
    return `/api/v1/device-ota/artifacts/${token}`;
  }

  async function checkForUpdate(deviceId, device, hardwareId) {
    const eligibility = await fleet.resolve(deviceId, (ref) => ref.get());
    if (hardwareId !== HARDWARE_ID) {
      throw new OtaError('unsupported_hardware', 'Device hardware identifier is incompatible.', 409);
    }
    const nextCheckAtUtcMs = await getNextCheck(device);
    const checkedAt = now();
    await db.collection('ota_device_status').doc(deviceId).set({
      device_id: deviceId, last_check_at: checkedAt,
      next_check_at: new Date(nextCheckAtUtcMs),
    }, { merge: true });
    const assignmentSnap = await assignments.doc(deviceId).get();
    if (!assignmentSnap.exists) {
      return { update_available: false, next_check_at_utc_ms: nextCheckAtUtcMs };
    }
    const assignment = assignmentSnap.data();
    if (assignment.basis_hash !== eligibility.basis_hash) {
      throw new OtaError('assignment_changed', 'Device placement, trust or scheduling changed after authorization; engineering reconciliation is required.', 409);
    }
    const deploymentRef = deployments.doc(assignment.deployment_id);
    const deploymentSnap = await deploymentRef.get();
    const releaseSnap = await releases.doc(assignment.release_id).get();
    if (!deploymentSnap.exists || !releaseSnap.exists ||
        TERMINAL_STATES.has(deploymentSnap.data().state)) {
      return { update_available: false, next_check_at_utc_ms: nextCheckAtUtcMs };
    }
    const release = releaseSnap.data();
    fleet.requireRelease(assignment.release_id, release);
    const deviceError = fleet.capabilityError({
      ...device, device_id: deviceId, ota_capability: eligibility.capability,
    }, assignment.release_id);
    if (deviceError) throw new OtaError('device_not_eligible', deviceError, 409);
    const notBeforeAt = asDate(assignment.not_before);
    if (!notBeforeAt) {
      throw new OtaError('invalid_schedule', 'Assignment has no valid eligibility timestamp.', 409);
    }
    await deploymentRef.update({ last_check_at: checkedAt });
    if (notBeforeAt > checkedAt) {
      return { update_available: false, next_check_at_utc_ms: nextCheckAtUtcMs };
    }
    if (release.state !== 'published' || !release.hardware_ids?.includes(hardwareId)
        || release.sha256 !== acceptedReleases[release.release_id]
        || release.provenance?.signing_fingerprint !== PRODUCTION_FINGERPRINT) {
      throw new OtaError('release_unavailable', 'Assigned OTA release is no longer available.', 409);
    }
    requireArtifactStore();
    const artifactPath = await issueDownloadToken(
      assignment.deployment_id, deviceId, release
    );
    await deploymentRef.update({ offered_at: checkedAt });
    return {
      update_available: true,
      deployment_id: assignment.deployment_id,
      release_id: release.release_id,
      hardware_id: hardwareId,
      version: release.version,
      image_size: release.size_bytes,
      sha256: release.sha256,
      artifact_path: artifactPath,
      next_check_at_utc_ms: nextCheckAtUtcMs,
    };
  }

  async function reportUpdateEvent(deploymentId, deviceId, body) {
    const { state, firmware_version: firmwareVersion, error_code: errorCode = 0 } = body || {};
    if (!UPDATE_STATES.has(state) || typeof firmwareVersion !== 'string'
        || !VERSION_PATTERN.test(firmwareVersion)
        || !Number.isInteger(errorCode) || Math.abs(errorCode) > 65535
        || (state !== 'failed' && errorCode !== 0)) {
      throw new OtaError('invalid_update_event', 'OTA lifecycle event fields are invalid.');
    }
    const deploymentRef = deployments.doc(deploymentId);
    const eventId = eventDocumentId(state, firmwareVersion, errorCode);
    const eventRef = deploymentRef.collection('events').doc(eventId);
    const recordedAt = now();
    let result;
    await db.runTransaction(async (transaction) => {
      const deploymentSnap = await transaction.get(deploymentRef);
      if (!deploymentSnap.exists) {
        throw new OtaError('deployment_not_found', 'OTA deployment does not exist.', 404);
      }
      const deployment = deploymentSnap.data();
      if (deployment.device_id !== deviceId) {
        throw new OtaError('device_mismatch', 'OTA deployment belongs to another Device.', 403);
      }
      if (['trial_boot', 'confirmed'].includes(state)
          && firmwareVersion !== deployment.version_string) {
        throw new OtaError('firmware_version_mismatch', 'Boot/confirmation version must match the assigned image.', 409);
      }
      if (deployment.state !== state &&
          !STATE_TRANSITIONS[deployment.state]?.has(state)) {
        throw new OtaError('invalid_state_transition', 'OTA lifecycle transition is not permitted.', 409);
      }
      const eventSnap = await transaction.get(eventRef);
      const statusRef = db.collection('ota_device_status').doc(deviceId);
      const statusSnap = state === 'confirmed' ? await transaction.get(statusRef) : null;
      const assignmentRef = assignments.doc(deviceId);
      const assignmentSnap = state === 'confirmed' ? await transaction.get(assignmentRef) : null;
      if (eventSnap.exists) {
        result = { deployment_id: deploymentId, state: deployment.state, duplicate: true };
        return;
      }
      if (deployment.state === state) {
        throw new OtaError('conflicting_update_event', 'Repeated lifecycle state has different evidence.', 409);
      }
      transaction.set(eventRef, {
        state,
        firmware_version: firmwareVersion,
        error_code: errorCode,
        created_at: recordedAt,
      });
      transaction.update(deploymentRef, {
        state,
        firmware_version: firmwareVersion,
        error_code: errorCode,
        updated_at: recordedAt,
        reported_at: { ...deployment.reported_at, [state]: recordedAt },
      });
      if (state === 'confirmed') {
        const status = statusSnap.exists ? statusSnap.data() : {};
        const currentAssignment = assignmentSnap.exists
          && assignmentSnap.data().deployment_id === deploymentId;
        if (currentAssignment && !status.confirmation_sequence) {
          transaction.set(statusRef, {
            confirmed_firmware_version: firmwareVersion, confirmed_at: recordedAt,
            confirmed_deployment_id: deploymentId,
            last_deployment_id: deploymentId,
            confirmed_schedule_mode: 'nightly',
          }, { merge: true });
          transaction.delete(assignmentRef);
        } else if (currentAssignment && status.confirmed_firmware_version === firmwareVersion) {
          transaction.set(statusRef, {
            confirmed_deployment_id: deploymentId,
            last_deployment_id: deploymentId,
            confirmed_schedule_mode: 'nightly',
          }, { merge: true });
          transaction.delete(assignmentRef);
        }
      }
      result = { deployment_id: deploymentId, state, duplicate: deployment.state === state };
    });
    return result;
  }

  async function confirmRunningFirmware(deviceId, body) {
    const version = body?.firmware_version;
    const sequence = body?.confirmation_sequence;
    const deploymentId = body?.deployment_id;
    if (typeof version !== 'string' || version.length >= 32 || !VERSION_PATTERN.test(version)
        || !Number.isInteger(sequence) || sequence < 1 || sequence > 0x7fffffff
        || (deploymentId !== undefined
          && (typeof deploymentId !== 'string' || !/^[A-Za-z0-9_-]{1,63}$/.test(deploymentId)))) {
      throw new OtaError('invalid_confirmation', 'A running firmware version and protected sequence are required.');
    }
    const ref = db.collection('ota_device_status').doc(deviceId);
    const recordedAt = now();
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const status = snap.exists ? snap.data() : {};
      const previous = status.confirmation_sequence ?? 0;
      if (sequence < previous) {
        throw new OtaError('stale_confirmation', 'A newer running firmware confirmation is already recorded.', 409);
      }
      if (sequence === previous) {
        if (status.confirmed_firmware_version !== version) {
          throw new OtaError('conflicting_confirmation', 'This confirmation sequence already identifies different firmware.', 409);
        }
        return;
      }
      const assignmentRef = assignments.doc(deviceId);
      const assignmentSnap = await transaction.get(assignmentRef);
      let completedDeploymentId = null;
      let deploymentRef = null;
      let deployment = null;
      let eventRef = null;
      let eventExists = false;
      if (assignmentSnap.exists && assignmentSnap.data().deployment_id === deploymentId) {
        deploymentRef = deployments.doc(deploymentId);
        const deploymentSnap = await transaction.get(deploymentRef);
        if (!deploymentSnap.exists || deploymentSnap.data().device_id !== deviceId) {
          throw new OtaError('invalid_assignment', 'The current OTA assignment requires engineering reconciliation.', 409);
        }
        deployment = deploymentSnap.data();
        if (deployment.version_string === version
            && (!TERMINAL_STATES.has(deployment.state) || deployment.state === 'confirmed')) {
          completedDeploymentId = deploymentRef.id;
          eventRef = deploymentRef.collection('events').doc(eventDocumentId('confirmed', version, 0));
          eventExists = (await transaction.get(eventRef)).exists;
        }
      }
      if (completedDeploymentId) {
        if (!eventExists) {
          transaction.set(eventRef, {
            state: 'confirmed', firmware_version: version, error_code: 0,
            created_at: recordedAt, source: 'authenticated_running_image',
            confirmation_sequence: sequence,
          });
        }
        if (deployment.state !== 'confirmed') {
          transaction.update(deploymentRef, {
            state: 'confirmed', firmware_version: version, error_code: 0,
            updated_at: recordedAt,
            reported_at: { ...deployment.reported_at, confirmed: recordedAt },
            confirmation_source: 'authenticated_running_image',
            confirmation_sequence: sequence,
          });
        }
        transaction.delete(assignmentRef);
      }
      transaction.set(ref, {
        confirmed_firmware_version: version,
        confirmed_at: recordedAt,
        confirmation_sequence: sequence,
        confirmation_source: 'authenticated_running_image',
        confirmed_deployment_id: completedDeploymentId,
        ...(completedDeploymentId ? { last_deployment_id: completedDeploymentId } : {}),
        confirmed_schedule_mode: Object.entries(RELEASE_VERSIONS).some(([id, value]) => (
          value === version && /^(OTA-0\.1alt|OTA-1\.0)/.test(id)
        )) ? 'nightly' : null,
      }, { merge: true });
    });
    return {
      device_id: deviceId, firmware_version: version,
      confirmation_sequence: sequence, acknowledged: true,
    };
  }

  async function getAuthorizedArtifact(token) {
    requireArtifactDelivery();
    requireArtifactStore();
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new OtaError('download_not_authorized', 'Artifact authorization is invalid.', 403);
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenSnap = await db.collection('ota_download_tokens').doc(tokenHash).get();
    const expiryValue = tokenSnap.exists ? tokenSnap.data().expires_at : null;
    const expiresAt = asDate(expiryValue);
    if (!tokenSnap.exists || !(expiresAt instanceof Date)
        || expiresAt.getTime() <= now().getTime()) {
      throw new OtaError('download_not_authorized', 'Artifact authorization is expired or invalid.', 403);
    }
    const grant = tokenSnap.data();
    const releaseSnap = await releases.doc(grant.release_id).get();
    const [deviceSnap, assignmentSnap, deploymentSnap] = await Promise.all([
      db.collection('devices').doc(grant.device_id).get(),
      assignments.doc(grant.device_id).get(),
      deployments.doc(grant.deployment_id).get(),
    ]);
    if (!deviceSnap.exists
        || !assignmentSnap.exists || assignmentSnap.data().deployment_id !== grant.deployment_id
        || !asDate(assignmentSnap.data().not_before)
        || asDate(assignmentSnap.data().not_before) > now()
        || !deploymentSnap.exists || TERMINAL_STATES.has(deploymentSnap.data().state)) {
      throw new OtaError('download_not_authorized', 'Assignment is no longer eligible for download.', 403);
    }
    const eligibility = await fleet.resolve(grant.device_id, (ref) => ref.get(), grant.release_id);
    if (assignmentSnap.data().basis_hash !== eligibility.basis_hash) {
      throw new OtaError('assignment_changed', 'Device eligibility changed after authorization.', 409);
    }
    if (!releaseSnap.exists || releaseSnap.data().state !== 'published'
        || releaseSnap.data().object_path !== grant.object_path
        || releaseSnap.data().sha256 !== acceptedReleases[grant.release_id]) {
      throw new OtaError('artifact_unavailable', 'Artifact is unavailable.', 404);
    }
    fleet.requireRelease(grant.release_id, releaseSnap.data());
    await deployments.doc(grant.deployment_id).update({ artifact_requested_at: now() });
    return { grant, release: releaseSnap.data() };
  }

  async function streamArtifact(objectPath, options) {
    requireArtifactDelivery();
    requireArtifactStore();
    return artifactStore.createReadStream(objectPath, options);
  }

  return {
    assignRelease,
    listFleet: fleet.listFleet,
    prepareAssignment: fleet.prepare,
    confirmAssignment: fleet.confirm,
    checkForUpdate,
    getAuthorizedArtifact,
    getNextCheck,
    listDeployments,
    listReleases,
    async listDeviceStatus() {
      const snapshots = await db.collection('ota_device_status').get();
      return snapshots.docs.map((snap) => ({ ...snap.data(), device_id: snap.id }));
    },
    registerRelease,
    confirmRunningFirmware,
    reportUpdateEvent,
    streamArtifact,
  };
}

module.exports = {
  HARDWARE_ID,
  MCUBOOT_SECONDARY_SLOT_BYTES,
  MAX_SIGNED_IMAGE_BYTES,
  OtaError,
  createOtaService,
  nextCourseCheckTime,
  validateArtifact,
};
