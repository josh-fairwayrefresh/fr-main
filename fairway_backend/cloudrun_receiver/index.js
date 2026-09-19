const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { authenticateDeviceCredential } = require('./lib/fleet/devices');
const {
  isDeviceCommunicationAllowed,
  isValidEventType,
  EVENT_TYPES,
  deriveHoleFromLocation,
  deriveDisplayLabelFromLocation,
} = require('./lib/fleet/schema');
const { isValidHealthObservation, recordHealthObservation, resolveDeviceHierarchyConfig } = require('./lib/fleet/health');

const DEVICE_KEY_HEADER = 'x-fairway-device-key';

function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function sendCorsOk(res) {
  setCorsHeaders(res);
  return res.status(204).send('');
}

/*
 * Builds the production Device-event/status-update handlers against the
 * given Firestore client. Production registers these against a real
 * Firestore instance below; tests call this same factory with the fake
 * Firestore double so the identical handler logic executes in both cases
 * (no test-only duplicate handler).
 */
function createFairwayHandlers(db) {
  /*
   * Persists a golfer button_press request. Behavior is byte-for-byte
   * unchanged from the pre-WP4 implementation; only its call site moved
   * (device lookup/state/credential/hierarchy checks now happen once, in
   * handleDeviceEvent, before dispatching here or to persistHealthReport).
   */
  async function persistButtonPressRequest(res, deviceId, device, body, eventType) {
    const existingOpenRequests = await db.collection('requests')
      .where('device_id', '==', deviceId)
      .where('status', 'in', ['new', 'confirmed'])
      .limit(1)
      .get();

    if (!existingOpenRequests.empty) {
      const existingRequest = existingOpenRequests.docs[0];

      console.log('Suppressed duplicate button request because an open request already exists:', {
        device_id: deviceId,
        existing_request_id: existingRequest.id,
      });

      return res.status(200).send(`OK existing request ${existingRequest.id}\n`);
    }

    const requestDoc = {
      course_id: device.course_id || 'unknown_course',
      course_name: device.course_name || null,
      device_id: deviceId,
      device_label: deriveDisplayLabelFromLocation(device.location),
      hole: deriveHoleFromLocation(device.location),
      event_type: eventType,
      status: 'new',
      source: 'nrf9151',
      received_at: FieldValue.serverTimestamp(),
      confirmed_at: null,
      completed_at: null,
      operator_id: null,
      raw_payload: body
    };

    const docRef = await db.collection('requests').add(requestDoc);

    console.log('Fairway button request stored:', {
      request_id: docRef.id,
      device_id: deviceId,
      event_type: eventType
    });

    return res.status(200).send(`OK ${docRef.id}\n`);
  }

  /*
   * Persists a validated health_report observation. Never creates a golfer
   * `requests` document and never participates in button duplicate
   * suppression; the two event types are handled by entirely separate
   * persistence paths. `received_at` is always this server's own
   * FieldValue.serverTimestamp(), never client-supplied. `effectiveConfig`
   * is resolved by the caller (handleDeviceEvent) as part of its fail-closed
   * hierarchy check, before any persistence occurs here.
   */
  async function persistHealthReport(res, deviceId, healthObservation, effectiveConfig) {
    if (!isValidHealthObservation(healthObservation)) {
      console.warn('Rejected malformed health report observation:', { device_id: deviceId });
      return res.status(400).send('Invalid health observation\n');
    }

    await recordHealthObservation(db, deviceId, healthObservation, FieldValue.serverTimestamp());

    console.log('Fairway health report accepted:', { device_id: deviceId });

    return res.status(200).json({
      status: 'accepted',
      event_type: EVENT_TYPES.HEALTH_REPORT,
      effective_config: effectiveConfig,
    });
  }

  /*
   * Single authenticated Device request entry point for both button_press and
   * health_report events. Device lookup, lifecycle-state, credential, and
   * Customer/Course-hierarchy checks happen exactly once here, before any
   * event-type-specific persistence. A Device with no Customer/Course
   * assignment at all is legitimately unassigned and proceeds normally; a
   * Device that claims an assignment which cannot resolve through the
   * authoritative hierarchy is rejected outright, with zero persistence,
   * rather than silently accepted. An event_type outside the known set
   * fails closed rather than being silently treated as button_press.
   */
  async function handleDeviceEvent(req, res) {
    const body = req.body || {};

    const deviceId = body.device_id || body.device || 'unknown_device';
    const eventType = body.event_type || body.event || EVENT_TYPES.BUTTON_PRESS;
    const presentedCredential = req.get(DEVICE_KEY_HEADER);

    const deviceRef = db.collection('devices').doc(deviceId);
    const deviceSnap = await deviceRef.get();

    if (!deviceSnap.exists) {
      console.warn('Rejected device request from unknown device:', {
        device_id: deviceId
      });

      return res.status(404).send('Unknown device\n');
    }

    const device = deviceSnap.data();

    if (!isDeviceCommunicationAllowed(device.state)) {
      console.warn('Rejected device request from inactive device:', {
        device_id: deviceId
      });

      return res.status(403).send('Inactive device\n');
    }

    if (!authenticateDeviceCredential(device, presentedCredential)) {
      console.warn('Rejected device request with missing or invalid device credential:', {
        device_id: deviceId
      });

      return res.status(401).send('Unauthorized\n');
    }

    const hierarchy = await resolveDeviceHierarchyConfig(db, device);

    if (!hierarchy.valid) {
      console.warn('Rejected device request with invalid Customer/Course hierarchy:', {
        device_id: deviceId
      });

      return res.status(422).send('Invalid device hierarchy\n');
    }

    if (!isValidEventType(eventType)) {
      console.warn('Rejected device request with unknown event_type:', {
        device_id: deviceId,
        event_type: eventType
      });

      return res.status(400).send('Unknown event\n');
    }

    if (eventType === EVENT_TYPES.HEALTH_REPORT) {
      return persistHealthReport(res, deviceId, body.health, hierarchy.effectiveConfig);
    }

    return persistButtonPressRequest(res, deviceId, device, body, eventType);
  }

  async function updateRequestStatus(req, res, requestId, action) {
    const validActions = {
      confirm: {
        status: 'confirmed',
        timestampField: 'confirmed_at'
      },
      complete: {
        status: 'completed',
        timestampField: 'completed_at'
      }
    };

    const actionConfig = validActions[action];

    if (!actionConfig) {
      return res.status(404).send('Not Found\n');
    }

    const requestRef = db.collection('requests').doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return res.status(404).send('Request not found\n');
    }

    await requestRef.update({
      status: actionConfig.status,
      [actionConfig.timestampField]: FieldValue.serverTimestamp(),
      operator_id: 'local_dashboard'
    });

    console.log('Fairway request status updated:', {
      request_id: requestId,
      status: actionConfig.status
    });

    return res.status(200).send(`OK ${requestId} ${actionConfig.status}\n`);
  }

  async function fairwayButtonReceiver(req, res) {
    setCorsHeaders(res);

    try {
      if (req.method === 'OPTIONS') {
        return sendCorsOk(res);
      }

      if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed\n');
      }

      const path = req.path || '/';

      const statusMatch = path.match(/^\/api\/v1\/requests\/([^/]+)\/(confirm|complete)$/);
      if (statusMatch) {
        const requestId = statusMatch[1];
        const action = statusMatch[2];

        return await updateRequestStatus(req, res, requestId, action);
      }

      if (path === '/' || path === '/api/v1/button-events') {
        return await handleDeviceEvent(req, res);
      }

      return res.status(404).send('Not Found\n');
    } catch (error) {
      console.error('Failed to handle Fairway request:', error);
      return res.status(500).send('Internal Server Error\n');
    }
  }

  return { fairwayButtonReceiver, handleDeviceEvent, updateRequestStatus };
}

const { fairwayButtonReceiver } = createFairwayHandlers(new Firestore());

functions.http('fairwayButtonReceiver', fairwayButtonReceiver);

module.exports = { createFairwayHandlers };