const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
require('./notifier');
const { resolveRuntimeEnvironment } = require('./lib/environment');
const { createCustomer, updateCustomer } = require('./lib/fleet/customers');
const { createCourse, updateCourse } = require('./lib/fleet/courses');
const {
  authenticateDeviceCredential,
  updateDeviceAssignment,
  updateDeviceState,
  updateDeviceMetadata,
  recordDeviceService,
  recordDeviceCommissioning,
} = require('./lib/fleet/devices');
const {
  provisionNewDevice,
  issueCredentialForExistingDevice,
  ProvisioningError,
} = require('./lib/fleet/provisioning');
const {
  isDeviceCommunicationAllowed,
  isValidEventType,
  EVENT_TYPES,
  deriveHoleFromLocation,
  deriveDisplayLabelFromLocation,
  DEMAND_WINDOW_MS,
} = require('./lib/fleet/schema');
const { isValidHealthObservation, recordHealthObservation, resolveDeviceHierarchyConfig, resolveCourseLocalDateHour } = require('./lib/fleet/health');
const {
  getOperatorAssignment,
  registerPushSubscription,
} = require('./lib/operator_notifications');

const DEVICE_KEY_HEADER = 'x-fairway-device-key';
const OPERATOR_AUTH_HEADER = 'authorization';
const COMPLETE_COMMAND_TYPE = 'complete';
const DISPLAYED_HEALTH_FIELDS = Object.freeze([
  'received_at', 'battery_soc_pct', 'battery_voltage_u_v', 'rsrp_dbm', 'rsrq_db',
  'snr_db', 'modem_temperature_m_c', 'https_succeeded', 'attempts',
]);
const KNOWN_STALE_DEVICE_FIELDS = Object.freeze({
  'FRB-0002': new Set(['hardware_revision', 'firmware_generation']),
});

function availability(value, stale = false, unavailableAtAcquisition = false) {
  if (stale) return 'known_stale';
  if (value === null || value === undefined) {
    return unavailableAtAcquisition ? 'unavailable_at_acquisition' : 'not_recorded';
  }
  return 'available';
}

function healthReadModel(health) {
  if (!health) return null;
  const values = Object.fromEntries(DISPLAYED_HEALTH_FIELDS.map((field) => [field, health[field] ?? null]));
  values.field_status = Object.fromEntries(DISPLAYED_HEALTH_FIELDS.map((field) => [
    field, availability(values[field], false, true),
  ]));
  return values;
}

async function verifyFirebaseIdToken(token) {
  const { getApps, initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');

  if (getApps().length === 0) {
    initializeApp();
  }

  return getAuth().verifyIdToken(token);
}

function completeCommandId(requestId) {
  return `${COMPLETE_COMMAND_TYPE}__${requestId}`;
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value.toDate === 'function') {
    return value.toDate();
  }

  return null;
}

function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
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
function createFairwayHandlers(db, {
  verifyOperatorToken = verifyFirebaseIdToken,
  now = () => new Date(),
  allowedAdminOrigin = null,
  vapidPublicKey = process.env.FAIRWAY_VAPID_PUBLIC_KEY || null,
  vapidKeyVersion = process.env.FAIRWAY_VAPID_KEY_VERSION || null,
} = {}) {
  /*
   * Persists a golfer button_press request. Request persistence, duplicate
   * suppression, and the `requests` document shape are byte-for-byte
   * unchanged from the pre-WP4 implementation. The response body now
   * returns JSON (status/event_type/request_id/effective_config) instead of
   * plain text so a successful button_press communication can refresh the
   * Device's cached scheduling config exactly like health_report already
   * does, using the same effectiveConfig already resolved once by the
   * caller (handleDeviceEvent) -- no duplicate configuration-calculation
   * logic. HTTP 200 status and existing auth/state/hierarchy enforcement
   * (all in handleDeviceEvent, before this function runs) are unchanged.
   */
  async function persistButtonPressRequest(res, deviceId, device, body, eventType, effectiveConfig, now) {
    const existingOpenRequests = await db.collection('requests')
      .where('device_id', '==', deviceId)
      .where('status', 'in', ['new', 'confirmed'])
      .where('demand_window_expires_at', '>', now)
      .limit(1)
      .get();

    if (!existingOpenRequests.empty) {
      const existingRequest = existingOpenRequests.docs[0];

      console.log('Suppressed duplicate button request because its demand window remains active:', {
        device_id: deviceId,
        existing_request_id: existingRequest.id,
      });

      return res.status(200).json({
        status: 'accepted',
        event_type: EVENT_TYPES.BUTTON_PRESS,
        request_id: existingRequest.id,
        duplicate: true,
        effective_config: effectiveConfig,
      });
    }

    const courseLocalDateHour = effectiveConfig
      ? resolveCourseLocalDateHour(now, effectiveConfig.timezone)
      : null;

    const requestDoc = {
      customer_id: device.customer_id || null,
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
      repeat_press_count: 0,
      last_repeat_press_at: null,
      demand_window_expires_at: new Date(now.getTime() + DEMAND_WINDOW_MS),
      device_state_at_request: device.state,
      course_local_date: courseLocalDateHour ? courseLocalDateHour.date : null,
      course_local_hour: courseLocalDateHour ? courseLocalDateHour.hour : null,
      raw_payload: body
    };

    const docRef = await db.collection('requests').add(requestDoc);

    console.log('Fairway button request stored:', {
      request_id: docRef.id,
      device_id: deviceId,
      event_type: eventType
    });

    return res.status(200).json({
      status: 'accepted',
      event_type: EVENT_TYPES.BUTTON_PRESS,
      request_id: docRef.id,
      effective_config: effectiveConfig,
    });
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
    const requestTime = now();
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

    const hierarchy = await resolveDeviceHierarchyConfig(db, device, requestTime);

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

    return persistButtonPressRequest(res, deviceId, device, body, eventType, hierarchy.effectiveConfig, requestTime);
  }

  async function authenticateOperator(req, res) {
    const authorization = req.get(OPERATOR_AUTH_HEADER) || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      res.status(401).send('Unauthorized\n');
      return null;
    }

    try {
      const identity = await verifyOperatorToken(match[1]);

      if (!identity || typeof identity.uid !== 'string' || identity.uid.length === 0) {
        res.status(401).send('Unauthorized\n');
        return null;
      }

      return identity;
    } catch (error) {
      console.warn('Rejected operator request with invalid Firebase ID token');
      res.status(401).send('Unauthorized\n');
      return null;
    }
  }

  async function authenticateAdmin(req, res) {
    const identity = await authenticateOperator(req, res);

    if (!identity) {
      return null;
    }

    if (identity.admin !== true) {
      res.status(403).send('Admin access required\n');
      return null;
    }

    return identity;
  }

  async function authorizeOperator(req, res) {
    const identity = await authenticateOperator(req, res);
    if (!identity) return null;

    const assignment = await getOperatorAssignment(db, identity.uid);
    if (!assignment) {
      res.status(403).send('Operator course access required\n');
      return null;
    }

    return { identity, assignment };
  }

  async function getOperatorBootstrap(req, res) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    if (!vapidPublicKey || !vapidKeyVersion) {
      return res.status(503).send('Push notifications are not configured\n');
    }

    return res.status(200).json({
      courses: operator.assignment.courses,
      push: {
        vapid_public_key: vapidPublicKey,
        vapid_key_version: vapidKeyVersion,
      },
    });
  }

  async function postOperatorPushSubscription(req, res) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    if (!vapidKeyVersion) {
      return res.status(503).send('Push notifications are not configured\n');
    }

    try {
      const result = await registerPushSubscription(db, operator.identity.uid, {
        courseId: req.body?.course_id,
        subscription: req.body?.subscription,
        userAgent: req.get('user-agent'),
        vapidKeyVersion,
        now: now(),
      });
      return res.status(200).json(result);
    } catch (error) {
      if (/not authorized/.test(error.message)) {
        return res.status(403).send(`${error.message}\n`);
      }
      if (/Invalid push subscription/.test(error.message)) {
        return res.status(400).send(`${error.message}\n`);
      }
      throw error;
    }
  }

  function requireBodyFields(body, allowedFields) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid JSON body');
    }

    const fields = Object.keys(body);
    if (fields.length === 0 || fields.some((field) => !allowedFields.includes(field))) {
      throw new Error('Invalid request fields');
    }
  }

  function sendAdminError(res, error) {
    if (error instanceof ProvisioningError) {
      if (error.cause?.message === 'Device already has a credential') {
        return res.status(409).json({ error: error.cause.message });
      }
      return res.status(error.deviceId ? 409 : 400).json({
        error: 'Device provisioning failed',
        stage: error.stage,
        device_id: error.deviceId,
        recovery_required: Boolean(error.deviceId),
      });
    }

    if (/^Unknown (customer_id|course_id|device_id)/.test(error.message)) {
      return res.status(404).json({ error: error.message });
    }
    if (/cross-customer|does not belong to customer|cannot have an active assignment/.test(error.message)) {
      return res.status(409).json({ error: error.message });
    }
    if (/Invalid|require(?:d|s)?|must be assigned|Valid Course|Health report schedule/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }

    throw error;
  }

  function deviceReadModel(deviceSnap, customersById, coursesByPath) {
    const device = deviceSnap.data();
    const identityIsAuthoritative = device.system_identity?.source === 'device_health' ||
      device.system_identity?.source === 'verified_provenance';
    const customer = device.customer_id ? customersById.get(device.customer_id) : null;
    const course = device.customer_id && device.course_id
      ? coursesByPath.get(`${device.customer_id}/${device.course_id}`)
      : null;
    const values = {
      device_id: deviceSnap.id,
      state: device.state ?? null,
      customer_id: device.customer_id ?? null,
      customer_name: customer?.customer_name ?? null,
      course_id: device.course_id ?? null,
      course_name: course?.course_name ?? null,
      location: device.location ?? null,
      comments: device.comments ?? null,
      sim_iccid: device.sim_iccid ?? null,
      hardware_revision: device.hardware_revision ?? null,
      firmware_generation: device.firmware_generation ?? null,
      system_identity: identityIsAuthoritative ? {
        source: device.system_identity.source,
        observed_at: device.system_identity.observed_at ?? null,
      } : null,
      commissioning: device.commissioning ?? null,
      service: device.service ?? null,
      credential_status: device.credential ? {
        algorithm: device.credential.algorithm,
        updated_at: device.credential.updated_at,
      } : null,
      latest_health: healthReadModel(device.latest_health),
      created_at: device.created_at ?? null,
      updated_at: device.updated_at ?? null,
    };
    values.field_status = Object.fromEntries(Object.keys(values)
      .filter((field) => field !== 'device_id')
      .map((field) => [field, availability(
        values[field],
        ['hardware_revision', 'firmware_generation'].includes(field) && !identityIsAuthoritative
      )]));
    return values;
  }

  async function listAdminFleet(req, res) {
    const [customersSnap, devicesSnap] = await Promise.all([
      db.collection('customers').limit(500).get(),
      db.collection('devices').limit(500).get(),
    ]);

    const customersById = new Map();
    const coursesByPath = new Map();
    const customers = await Promise.all(customersSnap.docs.map(async (customerSnap) => {
      const source = customerSnap.data();
      const coursesSnap = await customerSnap.ref.collection('courses').limit(500).get();
      const courses = coursesSnap.docs.map((courseSnap) => {
        const courseSource = courseSnap.data();
        const course = {
          course_id: courseSnap.id,
          course_name: courseSource.course_name ?? null,
          timezone: courseSource.timezone ?? null,
          health_report_schedule: courseSource.health_report_schedule ?? null,
          comments: courseSource.comments ?? null,
        };
        course.field_status = Object.fromEntries(['course_name', 'timezone', 'health_report_schedule', 'comments']
          .map((field) => [field, availability(course[field])]));
        coursesByPath.set(`${customerSnap.id}/${courseSnap.id}`, course);
        return course;
      });
      const customer = {
        customer_id: customerSnap.id,
        customer_name: source.customer_name ?? null,
        comments: source.comments ?? null,
        field_status: {
          customer_name: availability(source.customer_name),
          comments: availability(source.comments),
        },
        courses,
      };
      customersById.set(customerSnap.id, customer);
      return customer;
    }));

    const devices = devicesSnap.docs.map((deviceSnap) =>
      deviceReadModel(deviceSnap, customersById, coursesByPath));

    return res.status(200).json({
      review_mode: 'production_admin',
      field_status_values: ['available', 'not_recorded', 'unavailable_at_acquisition', 'known_stale'],
      customers,
      devices,
    });
  }

  async function getAdminHealthHistory(res, deviceId) {
    const deviceSnap = await db.collection('devices').doc(deviceId).get();
    if (!deviceSnap.exists) {
      return res.status(404).send('Unknown device\n');
    }

    const historySnap = await deviceSnap.ref.collection('health_history')
      .orderBy('received_at', 'desc')
      .limit(100)
      .get();
    const history = historySnap.docs
      .map((historySnap) => ({ history_id: historySnap.id, ...healthReadModel(historySnap.data()) }));

    return res.status(200).json({ device_id: deviceId, history });
  }

  async function createAdminCustomer(req, res) {
    requireBodyFields(req.body, ['customer_name', 'comments']);
    const customer = await createCustomer(db, {
      customerName: req.body.customer_name,
      comments: req.body.comments,
    });
    return res.status(201).json(customer);
  }

  async function patchAdminCustomer(req, res, customerId) {
    requireBodyFields(req.body, ['customer_name', 'comments']);
    const customer = await updateCustomer(db, customerId, {
      customerName: req.body.customer_name,
      comments: req.body.comments,
    });
    return res.status(200).json(customer);
  }

  async function createAdminCourse(req, res, customerId) {
    requireBodyFields(req.body, ['course_name', 'timezone', 'health_report_schedule', 'comments']);
    const course = await createCourse(db, {
      customerId,
      courseName: req.body.course_name,
      timezone: req.body.timezone,
      healthReportSchedule: req.body.health_report_schedule,
      comments: req.body.comments,
    });
    return res.status(201).json(course);
  }

  async function patchAdminCourse(req, res, customerId, courseId) {
    requireBodyFields(req.body, ['course_name', 'timezone', 'health_report_schedule', 'comments']);
    const course = await updateCourse(db, customerId, courseId, {
      courseName: req.body.course_name,
      timezone: req.body.timezone,
      healthReportSchedule: req.body.health_report_schedule,
      comments: req.body.comments,
    });
    return res.status(200).json(course);
  }

  async function provisionAdminDevice(req, res) {
    requireBodyFields(req.body, [
      'comments', 'sim_iccid',
    ]);
    const result = await provisionNewDevice(db, {
      comments: req.body.comments,
      simIccid: req.body.sim_iccid,
    });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({
      device_id: result.deviceId,
      one_time_credential: result.plaintextCredential,
    });
  }

  async function recoverAdminDeviceCredential(res, deviceId) {
    const result = await issueCredentialForExistingDevice(db, deviceId);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      device_id: result.deviceId,
      one_time_credential: result.plaintextCredential,
    });
  }

  async function patchAdminDeviceAssignment(req, res, deviceId) {
    requireBodyFields(req.body, ['customer_id', 'course_id', 'location']);
    const device = await updateDeviceAssignment(db, deviceId, {
      customerId: req.body.customer_id,
      courseId: req.body.course_id,
      location: req.body.location,
    });
    return res.status(200).json(redactDeviceResult(device));
  }

  async function patchAdminDeviceState(req, res, deviceId) {
    requireBodyFields(req.body, ['state', 'customer_id', 'course_id', 'location']);
    const device = await updateDeviceState(db, deviceId, req.body.state, {
      customerId: req.body.customer_id,
      courseId: req.body.course_id,
      location: req.body.location,
    });
    return res.status(200).json(redactDeviceResult(device));
  }

  async function patchAdminDeviceMetadata(req, res, deviceId) {
    requireBodyFields(req.body, ['comments', 'sim_iccid']);
    const device = await updateDeviceMetadata(db, deviceId, req.body);
    return res.status(200).json(redactDeviceResult(device));
  }

  function redactDeviceResult(device) {
    const { credential, ...redacted } = device;
    return redacted;
  }

  async function recordAdminDeviceEvent(res, deviceId, admin, event) {
    const recordedAt = FieldValue.serverTimestamp();
    const device = event === 'service'
      ? await recordDeviceService(db, deviceId, admin.uid, recordedAt)
      : await recordDeviceCommissioning(db, deviceId, admin.uid, recordedAt);
    return res.status(200).json(redactDeviceResult(device));
  }

  function csvValue(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  async function exportDeviceSimCsv(res) {
    const devicesSnap = await db.collection('devices').limit(5000).get();
    const columns = [
      'device_id', 'sim_iccid', 'customer_id', 'customer_name',
      'course_id', 'course_name', 'state',
    ];
    const rows = devicesSnap.docs.map((deviceSnap) => {
      const device = deviceSnap.data();
      return columns.map((column) => csvValue(column === 'device_id' ? deviceSnap.id : device[column])).join(',');
    });

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="fairway-device-sim.csv"');
    return res.status(200).send(`${columns.join(',')}\n${rows.join('\n')}\n`);
  }

  async function handleAdminRequest(req, res, path) {
    const admin = await authenticateAdmin(req, res);
    if (!admin) {
      return res;
    }

    try {
      if (req.method === 'GET' && path === '/api/v1/admin/fleet') {
        return await listAdminFleet(req, res);
      }
      if (req.method === 'GET' && path === '/api/v1/admin/export/device-sim') {
        return await exportDeviceSimCsv(res);
      }

      const healthHistoryMatch = path.match(/^\/api\/v1\/admin\/devices\/([^/]+)\/health-history$/);
      if (req.method === 'GET' && healthHistoryMatch) {
        return await getAdminHealthHistory(res, healthHistoryMatch[1]);
      }
      if (req.method === 'POST' && path === '/api/v1/admin/customers') {
        return await createAdminCustomer(req, res);
      }
      if (req.method === 'POST' && path === '/api/v1/admin/devices') {
        return await provisionAdminDevice(req, res);
      }

      const customerMatch = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)$/);
      if (req.method === 'PATCH' && customerMatch) {
        return await patchAdminCustomer(req, res, customerMatch[1]);
      }

      const coursesMatch = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)\/courses$/);
      if (req.method === 'POST' && coursesMatch) {
        return await createAdminCourse(req, res, coursesMatch[1]);
      }
      const courseMatch = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)\/courses\/([^/]+)$/);
      if (req.method === 'PATCH' && courseMatch) {
        return await patchAdminCourse(req, res, courseMatch[1], courseMatch[2]);
      }

      const deviceActionMatch = path.match(/^\/api\/v1\/admin\/devices\/([^/]+)\/(assignment|state|metadata|service|commission)$/);
      if (deviceActionMatch) {
        const [, deviceId, action] = deviceActionMatch;
        if (req.method === 'PATCH' && action === 'assignment') {
          return await patchAdminDeviceAssignment(req, res, deviceId);
        }
        if (req.method === 'PATCH' && action === 'state') {
          return await patchAdminDeviceState(req, res, deviceId);
        }
        if (req.method === 'PATCH' && action === 'metadata') {
          return await patchAdminDeviceMetadata(req, res, deviceId);
        }
        if (req.method === 'POST' && (action === 'service' || action === 'commission')) {
          return await recordAdminDeviceEvent(res, deviceId, admin, action);
        }
      }

      const credentialRecoveryMatch = path.match(/^\/api\/v1\/admin\/devices\/([^/]+)\/credential-recovery$/);
      if (req.method === 'POST' && credentialRecoveryMatch) {
        return await recoverAdminDeviceCredential(res, credentialRecoveryMatch[1]);
      }

      return res.status(404).send('Not Found\n');
    } catch (error) {
      return sendAdminError(res, error);
    }
  }

  async function authenticateDevice(req, res, deviceId) {
    const deviceSnap = await db.collection('devices').doc(deviceId).get();

    if (!deviceSnap.exists) {
      res.status(404).send('Unknown device\n');
      return null;
    }

    const device = deviceSnap.data();

    if (!isDeviceCommunicationAllowed(device.state)) {
      res.status(403).send('Inactive device\n');
      return null;
    }

    if (!authenticateDeviceCredential(device, req.get(DEVICE_KEY_HEADER))) {
      res.status(401).send('Unauthorized\n');
      return null;
    }

    return device;
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

    const operator = await authorizeOperator(req, res);

    if (!operator) {
      return res;
    }

    const requestRef = db.collection('requests').doc(requestId);

    if (action === COMPLETE_COMMAND_TYPE) {
      const result = await db.runTransaction(async (transaction) => {
        const requestSnap = await transaction.get(requestRef);

        if (!requestSnap.exists) {
          return { notFound: true };
        }

        const requestData = requestSnap.data();
        if (!operator.assignment.courses.some((course) => course.course_id === requestData.course_id)) {
          return { forbidden: true };
        }
        const expiresAt = toDate(requestData.demand_window_expires_at);

        if (typeof requestData.device_id !== 'string' || !expiresAt) {
          return { invalid: true };
        }

        const commandId = completeCommandId(requestId);
        const commandRef = db.collection('devices').doc(requestData.device_id)
          .collection('commands').doc(commandId);
        const commandSnap = await transaction.get(commandRef);

        if (requestData.status !== actionConfig.status) {
          transaction.update(requestRef, {
            status: actionConfig.status,
            [actionConfig.timestampField]: FieldValue.serverTimestamp(),
            operator_id: operator.identity.uid,
          });
        }

        if (!commandSnap.exists) {
          transaction.set(commandRef, {
            command_id: commandId,
            device_id: requestData.device_id,
            type: COMPLETE_COMMAND_TYPE,
            request_id: requestId,
            status: 'pending',
            created_at: FieldValue.serverTimestamp(),
            expires_at: requestData.demand_window_expires_at,
            created_by: operator.identity.uid,
            acknowledged_at: null,
          });
        }

        return { commandId };
      });

      if (result.notFound) {
        return res.status(404).send('Request not found\n');
      }
      if (result.forbidden) {
        return res.status(403).send('Operator is not authorized for this Course\n');
      }
      if (result.invalid) {
        return res.status(422).send('Request is missing command correlation data\n');
      }
    } else {
      const requestSnap = await requestRef.get();

      if (!requestSnap.exists) {
        return res.status(404).send('Request not found\n');
      }

      if (!operator.assignment.courses.some((course) => course.course_id === requestSnap.data().course_id)) {
        return res.status(403).send('Operator is not authorized for this Course\n');
      }

      await requestRef.update({
        status: actionConfig.status,
        [actionConfig.timestampField]: FieldValue.serverTimestamp(),
        operator_id: operator.identity.uid,
      });
    }

    console.log('Fairway request status updated:', {
      request_id: requestId,
      status: actionConfig.status
    });

    return res.status(200).send(`OK ${requestId} ${actionConfig.status}\n`);
  }

  async function pollDeviceCommand(req, res) {
    const body = req.body || {};
    const deviceId = body.device_id;
    const activeRequestId = body.active_request_id;

    if (typeof deviceId !== 'string' || typeof activeRequestId !== 'string') {
      return res.status(400).send('Invalid command poll\n');
    }

    if (!await authenticateDevice(req, res, deviceId)) {
      return res;
    }

    const requestSnap = await db.collection('requests').doc(activeRequestId).get();

    if (!requestSnap.exists || requestSnap.data().device_id !== deviceId) {
      return res.status(200).json({ status: 'accepted', command: null });
    }

    const commandId = completeCommandId(activeRequestId);
    const commandSnap = await db.collection('devices').doc(deviceId)
      .collection('commands').doc(commandId).get();

    if (!commandSnap.exists) {
      return res.status(200).json({ status: 'accepted', command: null });
    }

    const command = commandSnap.data();
    const expiresAt = toDate(command.expires_at);
    const matches = command.command_id === commandId &&
      command.device_id === deviceId &&
      command.type === COMPLETE_COMMAND_TYPE &&
      command.request_id === activeRequestId &&
      command.status === 'pending' &&
      expiresAt && expiresAt.getTime() > now().getTime();

    if (!matches) {
      return res.status(200).json({ status: 'accepted', command: null });
    }

    return res.status(200).json({
      status: 'accepted',
      command: {
        command_id: command.command_id,
        device_id: command.device_id,
        type: command.type,
        request_id: command.request_id,
        expires_at: expiresAt.toISOString(),
      },
    });
  }

  async function acknowledgeDeviceCommand(req, res, commandId) {
    const body = req.body || {};
    const deviceId = body.device_id;
    const requestId = body.request_id;

    if (typeof deviceId !== 'string' || typeof requestId !== 'string') {
      return res.status(400).send('Invalid command acknowledgement\n');
    }

    if (!await authenticateDevice(req, res, deviceId)) {
      return res;
    }

    const expectedCommandId = completeCommandId(requestId);

    if (commandId !== expectedCommandId) {
      return res.status(409).send('Command correlation mismatch\n');
    }

    const commandRef = db.collection('devices').doc(deviceId)
      .collection('commands').doc(commandId);
    const result = await db.runTransaction(async (transaction) => {
      const commandSnap = await transaction.get(commandRef);

      if (!commandSnap.exists) {
        return { notFound: true };
      }

      const command = commandSnap.data();
      const matches = command.command_id === commandId &&
        command.device_id === deviceId &&
        command.type === COMPLETE_COMMAND_TYPE &&
        command.request_id === requestId;

      if (!matches) {
        return { mismatch: true };
      }

      if (command.status === 'acknowledged') {
        return {};
      }

      const expiresAt = toDate(command.expires_at);

      if (!expiresAt || expiresAt.getTime() <= now().getTime()) {
        return { expired: true };
      }

      transaction.update(commandRef, {
        status: 'acknowledged',
        acknowledged_at: FieldValue.serverTimestamp(),
      });

      return {};
    });

    if (result.notFound) {
      return res.status(404).send('Command not found\n');
    }
    if (result.mismatch) {
      return res.status(409).send('Command correlation mismatch\n');
    }
    if (result.expired) {
      return res.status(409).send('Command expired\n');
    }

    return res.status(200).json({ status: 'acknowledged', command_id: commandId });
  }

  async function fairwayButtonReceiver(req, res) {
    setCorsHeaders(res);

    try {
      if (req.method === 'OPTIONS') {
        return sendCorsOk(res);
      }

      const path = req.path || '/';

      if (path.startsWith('/api/v1/admin/')) {
        return res.status(404).send('Not Found\n');
      }

      if (req.method === 'GET' && path === '/api/v1/operator/bootstrap') {
        return await getOperatorBootstrap(req, res);
      }
      if (req.method === 'POST' && path === '/api/v1/operator/push-subscriptions') {
        return await postOperatorPushSubscription(req, res);
      }

      if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed\n');
      }

      if (path === '/api/v1/device-commands/poll') {
        return await pollDeviceCommand(req, res);
      }

      const commandAckMatch = path.match(/^\/api\/v1\/device-commands\/([^/]+)\/ack$/);
      if (commandAckMatch) {
        return await acknowledgeDeviceCommand(req, res, commandAckMatch[1]);
      }

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
      if (error && error.type === 'entity.parse.failed') {
        return res.status(400).send('Invalid JSON\n');
      }
      console.error('Failed to handle Fairway request:', error);
      return res.status(500).send('Internal Server Error\n');
    }
  }

  async function fairwayAdmin(req, res) {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Origin');
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin && origin !== allowedAdminOrigin) {
      return res.status(403).send('Origin not allowed\n');
    }
    if (origin === allowedAdminOrigin) {
      res.set('Access-Control-Allow-Origin', allowedAdminOrigin);
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return res.status(204).send('');
    }
    const path = req.path || '/';
    if (!path.startsWith('/api/v1/admin/')) {
      return res.status(404).send('Not Found\n');
    }
    return handleAdminRequest(req, res, path);
  }

  return {
    fairwayAdmin,
    fairwayButtonReceiver,
    handleDeviceEvent,
    updateRequestStatus,
    listAdminFleet,
    pollDeviceCommand,
    acknowledgeDeviceCommand,
  };
}

const runtimeEnvironment = resolveRuntimeEnvironment();
const handlers = createFairwayHandlers(new Firestore({
  projectId: runtimeEnvironment.projectId,
}), { allowedAdminOrigin: runtimeEnvironment.allowedAdminOrigin });

if (runtimeEnvironment.serviceMode === 'admin') {
  functions.http('fairwayAdmin', handlers.fairwayAdmin);
} else {
  functions.http('fairwayButtonReceiver', handlers.fairwayButtonReceiver);
}

module.exports = { createFairwayHandlers };