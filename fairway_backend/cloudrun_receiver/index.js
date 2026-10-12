const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
require('./notifier');
const { resolveRuntimeEnvironment } = require('./lib/environment');
const { createCustomer, updateCustomer } = require('./lib/fleet/customers');
const { createCourse, getCourseForCustomer, updateCourse, coursesCollection } = require('./lib/fleet/courses');
const {
  activeServiceMinutes,
  nextScheduledStart,
  resolveCourseServiceState,
} = require('./lib/course_service');
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
const { resolveDeviceHierarchy, resolveCourseLocalDateHour } = require('./lib/fleet/hierarchy');
const inventory = require('./lib/inventory');
const {
  getOperatorAssignment,
  getNotificationPreferences,
  registerPushSubscription,
  setNotificationPreference,
} = require('./lib/operator_notifications');
const {
  AUTHORIZATION_SCHEMA_VERSION,
  getUserAccess,
  listCustomerCourses,
  normalizeAccessRecord,
} = require('./lib/user_access');

const DEVICE_KEY_HEADER = 'x-fairway-device-key';
const OPERATOR_AUTH_HEADER = 'authorization';
const COMPLETE_COMMAND_TYPE = 'complete';
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

async function verifyFirebaseIdToken(token) {
  const { getApps, initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');

  if (getApps().length === 0) {
    initializeApp();
  }

  return getAuth().verifyIdToken(token, true);
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
  firebaseAuth = null,
  now = () => new Date(),
  allowedAdminOrigins = [],
  vapidPublicKey = process.env.FAIRWAY_VAPID_PUBLIC_KEY || null,
  vapidKeyVersion = process.env.FAIRWAY_VAPID_KEY_VERSION || null,
} = {}) {
  /* Persists a golfer request using the validated demand-window suppression. */
  async function persistButtonPressRequest(res, deviceId, device, body, eventType, course, now) {
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
      });
    }

    const courseLocalDateHour = course
      ? resolveCourseLocalDateHour(now, course.timezone)
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
    });
  }

  /*
  * Authenticated Device button request entry point. Device lookup,
  * lifecycle-state, credential, and
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

    const hierarchy = await resolveDeviceHierarchy(db, device);

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

    if (hierarchy.course && !resolveCourseServiceState(hierarchy.course, requestTime).active) {
      console.log('Rejected golfer request because Course service is unavailable:', {
        device_id: deviceId,
        course_id: device.course_id,
      });
      return res.status(503).json({
        status: 'service_unavailable',
        event_type: EVENT_TYPES.BUTTON_PRESS,
      });
    }

    return persistButtonPressRequest(res, deviceId, device, body, eventType, hierarchy.course, requestTime);
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

    const access = await getUserAccess(db, identity.uid);
    if (!access?.admin) {
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
      res.status(403).send('Assigned course access required\n');
      return null;
    }

    return { identity, assignment };
  }

  function authClient() {
    if (firebaseAuth) return firebaseAuth;
    const { getApps, initializeApp } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    if (getApps().length === 0) initializeApp();
    return getAuth();
  }

  async function listAdminUsers(req, res) {
    const pageToken = req.query?.page_token || undefined;
    const page = await authClient().listUsers(1000, pageToken);
    const accessSnapshot = await db.collection('user_access').get();
    const records = new Map(accessSnapshot.docs.map((doc) => [
      doc.id,
      normalizeAccessRecord(doc.data()),
    ]));
    return res.status(200).json({
      users: page.users.map((user) => ({
        uid: user.uid,
        email: user.email || null,
        display_name: user.displayName || null,
        disabled: user.disabled === true,
        authorization: records.get(user.uid) || null,
      })),
      next_page_token: page.pageToken || null,
    });
  }

  async function updateAdminUserAccess(req, res, actingAdmin, uid) {
    const body = req.body;
    const allowedFields = ['admin', 'customer_id', 'course_ids'];
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== allowedFields.length ||
        Object.keys(body).some((field) => !allowedFields.includes(field)) ||
        typeof body.admin !== 'boolean' ||
        !Array.isArray(body.course_ids) ||
        body.course_ids.some((courseId) => typeof courseId !== 'string' || !courseId) ||
        new Set(body.course_ids).size !== body.course_ids.length) {
      return res.status(400).json({ error: 'invalid_authorization' });
    }

    let authUser;
    try {
      authUser = await authClient().getUser(uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'user_not_found' });
      }
      throw error;
    }
    const courseIds = body.admin ? [] : body.course_ids;
    let customerId = null;
    let canonicalCourses = [];
    if (!body.admin) {
      if (typeof body.customer_id !== 'string' || !body.customer_id) {
        return res.status(400).json({ error: 'customer_required' });
      }
      customerId = body.customer_id;
      canonicalCourses = await listCustomerCourses(db, customerId);
      if (!canonicalCourses) return res.status(400).json({ error: 'customer_not_found' });
      if (courseIds.some((courseId) => !canonicalCourses.some((course) => course.course_id === courseId))) {
        return res.status(400).json({ error: 'course_not_in_customer' });
      }
    } else if (body.customer_id !== null || body.course_ids.length !== 0) {
      return res.status(400).json({ error: 'admin_scope_must_be_global' });
    }

    const legacyCourses = body.admin
      ? []
      : courseIds.length
        ? canonicalCourses.filter((course) => courseIds.includes(course.course_id))
        : canonicalCourses;
    const accessRef = db.collection('user_access').doc(uid);
    const accessCollection = db.collection('user_access');
    const record = {
      schema_version: AUTHORIZATION_SCHEMA_VERSION,
      admin: body.admin,
      customer_id: customerId,
      course_ids: courseIds,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: actingAdmin.uid,
      user_type: body.admin ? 'fairway_staff' : 'customer_staff',
      enabled: true,
      courses: legacyCourses.map((course) => ({
        customer_id: course.customer_id,
        course_id: course.course_id,
        course_name: course.course_name,
      })),
    };

    let activeAuthUsers = null;
    await db.runTransaction(async (transaction) => {
      const records = await transaction.get(accessCollection);
      const current = records.docs.find((doc) => doc.id === uid);
      const currentAccess = current ? normalizeAccessRecord(current.data()) : null;
      if (currentAccess?.admin === true && body.admin === false && !activeAuthUsers) {
        activeAuthUsers = new Set();
        let token;
        do {
          // eslint-disable-next-line no-await-in-loop
          const page = await authClient().listUsers(1000, token);
          page.users.filter((user) => !user.disabled).forEach((user) => activeAuthUsers.add(user.uid));
          token = page.pageToken;
        } while (token);
      }
      const adminCount = records.docs.filter((doc) => (
        normalizeAccessRecord(doc.data())?.admin &&
        (!activeAuthUsers || activeAuthUsers.has(doc.id))
      )).length;
      if (currentAccess?.admin === true && body.admin === false && adminCount <= 1) {
        const error = new Error('At least one Admin must remain authorized');
        error.code = 'last_admin';
        throw error;
      }
      transaction.set(accessRef, record);
    });

    const saved = await getUserAccess(db, authUser.uid);
    return res.status(200).json({ uid, authorization: saved });
  }

  async function getOperatorBootstrap(req, res) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;

    return res.status(200).json({
      courses: operator.assignment.courses,
      push: vapidPublicKey && vapidKeyVersion ? {
        vapid_public_key: vapidPublicKey,
        vapid_key_version: vapidKeyVersion,
      } : null,
      notification_preferences: await getNotificationPreferences(
        db,
        operator.identity.uid,
        operator.assignment.courses
      ),
    });
  }

  async function updateOperatorNotificationPreference(req, res) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    try {
      const preference = await setNotificationPreference(
        db,
        operator.identity.uid,
        req.body?.customer_id,
        req.body?.course_id,
        req.body?.enabled,
        now()
      );
      return res.status(200).json(preference);
    } catch (error) {
      if (/not authorized/.test(error.message)) {
        return res.status(403).send(`${error.message}\n`);
      }
      if (/Invalid notification preference/.test(error.message)) {
        return res.status(400).send(`${error.message}\n`);
      }
      throw error;
    }
  }

  async function postOperatorPushSubscription(req, res) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    if (!vapidKeyVersion) {
      return res.status(503).send('Push notifications are not configured\n');
    }

    try {
      const result = await registerPushSubscription(db, operator.identity.uid, {
        customerId: req.body?.customer_id,
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

  async function authorizedCourse(operator, courseId, customerId = null) {
    const matches = operator.assignment.courses.filter((course) => (
      course.course_id === courseId && (!customerId || course.customer_id === customerId)
    ));
    if (matches.length !== 1) return null;
    const assignment = matches[0];
    return getCourseForCustomer(db, assignment.customer_id, assignment.course_id);
  }

  async function courseServiceReadModel(course, requestTime) {
    const eventsSnap = await coursesCollection(db, course.customer_id).doc(course.course_id)
      .collection('service_events').orderBy('recorded_at', 'desc').limit(500).get();
    const events = eventsSnap.docs.map((event) => event.data());
    return {
      course_id: course.course_id,
      course_name: course.course_name,
      timezone: course.timezone,
      service_schedule: course.service_schedule,
      service_state: resolveCourseServiceState(course, requestTime),
      service_events: events,
    };
  }

  function operatorCourseServiceModel(course) {
    const { service_events: _serviceEvents, ...model } = course;
    return model;
  }

  async function getOperatorDashboard(req, res) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    const requestTime = now();
    let assignedCourses = operator.assignment.courses;
    if (req.query?.course_id !== undefined || req.query?.customer_id !== undefined) {
      const courseId = req.query.course_id;
      const customerId = req.query.customer_id;
      if (typeof courseId !== 'string' || typeof customerId !== 'string') {
        return res.status(400).json({ error: 'invalid_course_context' });
      }
      assignedCourses = assignedCourses.filter((course) => (
        course.course_id === courseId && course.customer_id === customerId
      ));
      if (assignedCourses.length !== 1) {
        return res.status(403).send('Operator is not authorized for this Course\n');
      }
    }
    const courses = (await Promise.all(assignedCourses.map((assignment) =>
      getCourseForCustomer(db, assignment.customer_id, assignment.course_id))))
      .filter(Boolean);
    const serviceCourses = await Promise.all(courses.map((course) =>
      courseServiceReadModel(course, requestTime)));
    const requestSnapshots = await Promise.all(courses.map((course) => (
      db.collection('requests')
        .where('customer_id', '==', course.customer_id)
        .where('course_id', '==', course.course_id)
        .limit(5000)
        .get()
    )));
    const requests = requestSnapshots.flatMap((snapshot) => (
      snapshot.docs.map((document) => ({ request_id: document.id, ...document.data() }))
    ));
    const periods = [
      ['daily', 24 * 60],
      ['weekly', 7 * 24 * 60],
      ['monthly', 30 * 24 * 60],
    ];
    const summaries = Object.fromEntries(periods.map(([period, durationMinutes]) => {
      const start = new Date(requestTime.getTime() - durationMinutes * 60000);
      const periodRequests = requests.filter((request) => {
        const receivedAt = toDate(request.received_at);
        return receivedAt && receivedAt >= start && receivedAt <= requestTime;
      });
      const completed = periodRequests.filter((request) => request.status === 'completed');
      const cancelled = periodRequests.filter((request) => request.status === 'cancelled');
      const activeMinutes = courses.reduce((total, course) => {
        const service = serviceCourses.find((item) => item.course_id === course.course_id);
        return total + activeServiceMinutes(course, service.service_events, start, requestTime);
      }, 0);
      const activeHours = activeMinutes / 60;
      const completionMinutes = completed.map((request) => {
        const receivedAt = toDate(request.received_at);
        const completedAt = toDate(request.completed_at);
        return receivedAt && completedAt ? (completedAt - receivedAt) / 60000 : null;
      }).filter((value) => value !== null);
      return [period, {
        requests: periodRequests.length,
        completed_transactions: completed.length,
        cancelled_requests: cancelled.length,
        active_cart_hours: Number(activeHours.toFixed(2)),
        transactions_per_cart_hour: activeHours > 0 ? Number((completed.length / activeHours).toFixed(1)) : 0,
        requests_per_hour: activeHours > 0 ? Number((periodRequests.length / activeHours).toFixed(1)) : 0,
        average_completion_minutes: completionMinutes.length > 0
          ? Number((completionMinutes.reduce((sum, value) => sum + value, 0) / completionMinutes.length).toFixed(1))
          : null,
      }];
    }));
    const history = requests
      .filter((request) => ['completed', 'cancelled'].includes(request.status))
      .sort((left, right) => toDate(right.received_at) - toDate(left.received_at))
      .slice(0, 100);
    return res.status(200).json({
      courses: serviceCourses.map(operatorCourseServiceModel),
      summaries,
      history,
    });
  }

  async function updateCourseService(req, res, action) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    const courseId = req.body?.course_id;
    const course = await authorizedCourse(operator, courseId, req.body?.customer_id);
    if (!course) return res.status(403).send('Operator is not authorized for this Course\n');
    const requestTime = now();
    const courseRef = coursesCollection(db, course.customer_id).doc(course.course_id);
    if (action === 'suspend') {
      const until = nextScheduledStart(course, requestTime);
      if (!until) return res.status(409).send('Course service schedule is not configured\n');
      await courseRef.update({
        service_suspension: { suspended_at: requestTime, until, suspended_by: operator.identity.uid },
        updated_at: requestTime,
      });
      await courseRef.collection('service_events').add({
        type: 'suspended', recorded_at: requestTime, operator_id: operator.identity.uid, until,
      });
    } else {
      await courseRef.update({ service_suspension: null, updated_at: requestTime });
      await courseRef.collection('service_events').add({
        type: 'resumed', recorded_at: requestTime, operator_id: operator.identity.uid,
      });
    }
    const updated = await getCourseForCustomer(db, course.customer_id, course.course_id);
    return res.status(200).json(operatorCourseServiceModel(
      await courseServiceReadModel(updated, requestTime)
    ));
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
    if (error instanceof inventory.InventoryError) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
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
    if (/Invalid|require(?:d|s)?|must be assigned|Valid Course/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }

    throw error;
  }

  function deviceReadModel(deviceSnap, customersById, coursesByPath) {
    const device = deviceSnap.data();
    const identityIsAuthoritative = device.system_identity?.source === 'verified_provenance';
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
          service_schedule: courseSource.service_schedule ?? null,
          service_suspension: courseSource.service_suspension ?? null,
          comments: courseSource.comments ?? null,
        };
        course.field_status = Object.fromEntries(['course_name', 'timezone', 'service_schedule', 'service_suspension', 'comments']
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
    requireBodyFields(req.body, ['course_name', 'timezone', 'service_schedule', 'comments']);
    const course = await createCourse(db, {
      customerId,
      courseName: req.body.course_name,
      timezone: req.body.timezone,
      serviceSchedule: req.body.service_schedule,
      comments: req.body.comments,
    });
    return res.status(201).json(course);
  }

  async function patchAdminCourse(req, res, customerId, courseId) {
    requireBodyFields(req.body, ['course_name', 'timezone', 'service_schedule', 'comments']);
    const course = await updateCourse(db, customerId, courseId, {
      courseName: req.body.course_name,
      timezone: req.body.timezone,
      serviceSchedule: req.body.service_schedule,
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
      if (req.method === 'GET' && path === '/api/v1/admin/users') {
        return await listAdminUsers(req, res);
      }
      const userAccessMatch = path.match(/^\/api\/v1\/admin\/users\/([^/]+)\/access$/);
      if (req.method === 'PUT' && userAccessMatch) {
        return await updateAdminUserAccess(
          req, res, admin, decodeURIComponent(userAccessMatch[1])
        );
      }
      if (req.method === 'GET' && path === '/api/v1/admin/fleet') {
        return await listAdminFleet(req, res);
      }
      if (req.method === 'GET' && path === '/api/v1/admin/export/device-sim') {
        return await exportDeviceSimCsv(res);
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

      const menuSlugMatch = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)\/courses\/([^/]+)\/inventory-menu$/);
      if (req.method === 'PATCH' && menuSlugMatch) {
        requireBodyFields(req.body, ['public_menu_slug']);
        const configured = await inventory.configurePublicMenuSlug(
          db, menuSlugMatch[1], menuSlugMatch[2], req.body.public_menu_slug, admin.uid
        );
        return res.status(200).json(configured);
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
      if (error.code === 'last_admin') {
        return res.status(409).json({ error: 'last_admin_required' });
      }
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
      },
      cancel: {
        status: 'cancelled',
        timestampField: 'cancelled_at'
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
        if (!operator.assignment.courses.some((course) => (
          course.customer_id === requestData.customer_id &&
          course.course_id === requestData.course_id
        ))) {
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

        return { commandId, created: !commandSnap.exists, deviceId: requestData.device_id };
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

      console.log('COMPLETE command correlation:', {
        request_id: requestId,
        command_id: result.commandId,
        device_id: result.deviceId,
        created: result.created,
      });
    } else {
      const requestSnap = await requestRef.get();

      if (!requestSnap.exists) {
        return res.status(404).send('Request not found\n');
      }

      if (!operator.assignment.courses.some((course) => (
        course.customer_id === requestSnap.data().customer_id &&
        course.course_id === requestSnap.data().course_id
      ))) {
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

    const commandId = completeCommandId(activeRequestId);
    const logPollOutcome = (reason) => {
      console.log('COMPLETE poll correlation:', {
        device_id: deviceId,
        active_request_id: activeRequestId,
        command_id: commandId,
        reason,
      });
    };

    const requestSnap = await db.collection('requests').doc(activeRequestId).get();

    if (!requestSnap.exists || requestSnap.data().device_id !== deviceId) {
      logPollOutcome(!requestSnap.exists ? 'request_not_found' : 'request_device_mismatch');
      return res.status(200).json({ status: 'accepted', command: null });
    }

    const commandSnap = await db.collection('devices').doc(deviceId)
      .collection('commands').doc(commandId).get();

    if (!commandSnap.exists) {
      logPollOutcome('no_command_doc');
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
      logPollOutcome(command.status !== 'pending' ? `status_${command.status}` :
        (expiresAt && expiresAt.getTime() <= now().getTime() ? 'expired' : 'field_mismatch'));
      return res.status(200).json({ status: 'accepted', command: null });
    }

    logPollOutcome('matched');

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

    const ackReason = result.notFound ? 'not_found' :
      result.mismatch ? 'mismatch' :
      result.expired ? 'expired' : 'acknowledged';

    console.log('COMPLETE ack correlation:', {
      device_id: deviceId,
      request_id: requestId,
      command_id: commandId,
      reason: ackReason,
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
      if (req.method === 'GET' && path === '/api/v1/operator/dashboard') {
        return await getOperatorDashboard(req, res);
      }
      if (req.method === 'PATCH' && path === '/api/v1/operator/notification-preferences') {
        return await updateOperatorNotificationPreference(req, res);
      }
      if (req.method === 'POST' && path === '/api/v1/operator/push-subscriptions') {
        return await postOperatorPushSubscription(req, res);
      }
      if (req.method === 'POST' && path === '/api/v1/operator/service/suspend') {
        return await updateCourseService(req, res, 'suspend');
      }
      if (req.method === 'POST' && path === '/api/v1/operator/service/resume') {
        return await updateCourseService(req, res, 'resume');
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

      const statusMatch = path.match(/^\/api\/v1\/requests\/([^/]+)\/(confirm|complete|cancel)$/);
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
    if (origin && !allowedAdminOrigins.includes(origin)) {
      return res.status(403).send('Origin not allowed\n');
    }
    if (origin && allowedAdminOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return res.status(204).send('');
    }
    const path = req.path || '/';
    if (req.method === 'GET' && path === '/api/v1/access/bootstrap') {
      const identity = await authenticateOperator(req, res);
      if (!identity) return res;
      try {
        const access = await getUserAccess(db, identity.uid);
        if (!access) return res.status(403).json({ error: 'user_access_required' });
        return res.status(200).json({
          admin: access.admin,
          customer_id: access.customer_id,
          course_ids: access.course_ids,
          user_type: access.admin ? 'fairway_staff' : 'customer_staff',
        });
      } catch (error) {
        console.error('Failed to read user access record:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    }
    if (path.startsWith('/api/v1/inventory/')) {
      return handleInventoryRequest(req, res, path);
    }
    if (path.startsWith('/api/v1/public/menus/')) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
      try {
        const match = path.match(/^\/api\/v1\/public\/menus\/([^/]+)$/);
        if (!match) return res.status(404).json({ error: 'menu_not_found' });
        return res.status(200).json(await inventory.getPublicMenu(db, decodeURIComponent(match[1])));
      } catch (error) {
        return sendInventoryError(res, error);
      }
    }
    if (!path.startsWith('/api/v1/admin/')) {
      return res.status(404).send('Not Found\n');
    }
    return handleAdminRequest(req, res, path);
  }

  async function handleInventoryRequest(req, res, path) {
    const identity = await authenticateOperator(req, res);
    if (!identity) return res;

    try {
      if (req.method === 'GET' && path === '/api/v1/inventory/bootstrap') {
        return res.status(200).json(await inventory.getInventoryBootstrap(db, identity.uid));
      }

      const match = path.match(/^\/api\/v1\/inventory\/courses\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
      if (!match) return res.status(404).json({ error: 'not_found' });
      const customerId = decodeURIComponent(match[1]);
      const courseId = decodeURIComponent(match[2]);
      const action = match[3] || '';
      await inventory.requireCourseAccess(db, identity.uid, customerId, courseId);

      if (req.method === 'GET' && action === '') {
        return res.status(200).json(await inventory.listInventory(db, customerId, courseId));
      }
      if (req.method === 'GET' && action === 'preview') {
        return res.status(200).json(await inventory.previewMenu(db, customerId, courseId));
      }
      if (req.method === 'POST' && action === 'publish') {
        return res.status(200).json(await inventory.publishMenu(db, customerId, courseId, identity.uid));
      }
      if (req.method === 'POST' && action === 'categories') {
        requireBodyFields(req.body, ['name']);
        return res.status(201).json(await inventory.createCategory(
          db, customerId, courseId, req.body.name, identity.uid
        ));
      }
      const subcategoryMatch = action.match(/^categories\/([^/]+)\/subcategories$/);
      if (req.method === 'POST' && subcategoryMatch) {
        requireBodyFields(req.body, ['name']);
        return res.status(201).json(await inventory.createSubcategory(
          db, customerId, courseId, decodeURIComponent(subcategoryMatch[1]), req.body.name, identity.uid
        ));
      }
      const categoryIdMatch = action.match(/^categories\/([^/]+)$/);
      if (req.method === 'DELETE' && categoryIdMatch) {
        return res.status(200).json(await inventory.deleteCategory(
          db, customerId, courseId, decodeURIComponent(categoryIdMatch[1]), identity.uid
        ));
      }
      if (req.method === 'POST' && action === 'products') {
        return res.status(201).json(await inventory.createProduct(
          db, customerId, courseId, req.body, identity.uid
        ));
      }
      const productMatch = action.match(/^products\/([^/]+)$/);
      if (productMatch && req.method === 'PATCH') {
        return res.status(200).json(await inventory.updateProduct(
          db, customerId, courseId, decodeURIComponent(productMatch[1]), req.body, identity.uid
        ));
      }
      const archiveMatch = action.match(/^products\/([^/]+)\/archive$/);
      if (archiveMatch && req.method === 'POST') {
        return res.status(200).json(await inventory.archiveProduct(
          db, customerId, courseId, decodeURIComponent(archiveMatch[1]), identity.uid
        ));
      }
      return res.status(404).json({ error: 'not_found' });
    } catch (error) {
      return sendInventoryError(res, error);
    }
  }

  function sendInventoryError(res, error) {
    if (error instanceof inventory.InventoryError) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    console.error('Failed to handle Inventory request:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Inventory request failed' });
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
}), { allowedAdminOrigins: runtimeEnvironment.allowedAdminOrigins });

if (runtimeEnvironment.serviceMode === 'admin') {
  functions.http('fairwayAdmin', handlers.fairwayAdmin);
} else {
  functions.http('fairwayButtonReceiver', handlers.fairwayButtonReceiver);
}

module.exports = { createFairwayHandlers };