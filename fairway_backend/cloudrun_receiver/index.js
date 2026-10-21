const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
require('./notifier');
const { PRODUCTION_PROJECT_ID, resolveRuntimeEnvironment } = require('./lib/environment');
const { createCustomer, updateCustomer } = require('./lib/fleet/customers');
const {
  createCourse,
  getCourseForCustomer,
  updateCourse,
  coursesCollection,
  isValidIanaTimezone,
} = require('./lib/fleet/courses');
const {
  resolveCourseServiceState,
} = require('./lib/course_service');
const {
  ServiceControlError,
  cutoverCourse,
  serviceState,
  transitionCourseService,
} = require('./lib/service_control');
const { localDate, summarizeOperatorDashboard } = require('./lib/service_reporting');
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
  CredentialLifecycleError,
  prepareCredentialRotation,
  activateCredentialRotation,
  cancelCredentialRotation,
  getCredentialRotationStatus,
  getPendingCredentialRotationStatus,
} = require('./lib/fleet/credential_lifecycle');
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
  validateAccessRecord,
} = require('./lib/user_access');

const DEVICE_KEY_HEADER = 'x-fairway-device-key';
const OPERATOR_AUTH_HEADER = 'authorization';
const COMPLETE_COMMAND_TYPE = 'complete';
const MAX_ADMIN_DIRECTORY_ENTRIES = 10000;
const MAX_ADMIN_DIRECTORY_RESPONSE_BYTES = 8 * 1024 * 1024;
const PROTECTED_SYSTEM_ADMIN_UIDS = Object.freeze({
  'fairway-refresh-sandbox-260930': Object.freeze([
    'zY75qapxaIYe0Z35Ss8lOQwdUq72',
  ]),
  'savvy-kit-496703-r5': Object.freeze([
    '8ChxN9ikI3Zi4H4Tq4cS1dJSAQH3',
    'ALri7tjCy1XsXz0TcYQ6oyQs9of2',
  ]),
});

class AdminDirectoryError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = 'AdminDirectoryError';
    this.code = code;
    this.status = status;
  }
}

function resolveProtectedSystemAdminUids(projectId, configuration = PROTECTED_SYSTEM_ADMIN_UIDS) {
  const isProduction = projectId === PRODUCTION_PROJECT_ID;
  const invalidConfiguration = () => {
    throw new Error('Protected System Administrator configuration is invalid');
  };

  if (typeof projectId !== 'string' || !projectId) {
    return invalidConfiguration();
  }
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    if (isProduction) return invalidConfiguration();
    return [];
  }

  if (!Object.prototype.hasOwnProperty.call(configuration, projectId)) {
    if (isProduction) return invalidConfiguration();
    return [];
  }

  const protectedUids = configuration[projectId];
  if (!Array.isArray(protectedUids)
      || protectedUids.length === 0
      || protectedUids.some((uid) => typeof uid !== 'string' || !uid.trim() || uid.trim() !== uid)
      || new Set(protectedUids).size !== protectedUids.length) {
    return invalidConfiguration();
  }

  return protectedUids;
}

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
    initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FAIRWAY_GCP_PROJECT,
    });
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
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
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
  serviceControlV2Active = process.env.FAIRWAY_SERVICE_CONTROL_V2_ACTIVE === 'true',
  protectedSystemAdminUids = resolveProtectedSystemAdminUids(
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FAIRWAY_GCP_PROJECT
  ),
} = {}) {
  /* Persists a golfer request using the validated demand-window suppression. */
  async function persistButtonPressRequest(res, deviceId, device, body, eventType, course, requestTime) {
    const courseLocalDateHour = course
      ? resolveCourseLocalDateHour(requestTime, course.timezone)
      : null;
    const requestRef = db.collection('requests').doc();
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
      demand_window_expires_at: new Date(requestTime.getTime() + DEMAND_WINDOW_MS),
      device_state_at_request: device.state,
      course_local_date: courseLocalDateHour ? courseLocalDateHour.date : null,
      course_local_hour: courseLocalDateHour ? courseLocalDateHour.hour : null,
      raw_payload: body
    };
    const requests = db.collection('requests');
    const dedupeQuery = requests
      .where('device_id', '==', deviceId)
      .where('status', 'in', ['new', 'confirmed'])
      .where('demand_window_expires_at', '>', requestTime)
      .limit(1);
    let acceptedRequestId = requestRef.id;
    let duplicate = false;
    if (course && (serviceControlV2Active || course.service_schema_version === 2)) {
      const courseRef = coursesCollection(db, course.customer_id).doc(course.course_id);
      const eligibility = await db.runTransaction(async (transaction) => {
        const [courseSnap, existing] = await Promise.all([
          transaction.get(courseRef),
          transaction.get(dedupeQuery),
        ]);
        if (!courseSnap.exists) return { unavailable: true };
        const current = courseSnap.data();
        if (!existing.empty) return { requestId: existing.docs[0].id, duplicate: true };
        const versioned = current.service_schema_version === 2;
        const eligible = versioned
          ? ['on', 'off'].includes(current.service_status) && current.service_status === 'on'
          : serviceControlV2Active && resolveCourseServiceState(current, requestTime).active;
        if (!eligible) return { unavailable: true };
        transaction.set(requestRef, {
          ...requestDoc,
          received_at: FieldValue.serverTimestamp(),
          service_acceptance_generation: versioned ? current.service_generation : null,
          service_accepted_while_on: true,
          service_acceptance_source: versioned ? 'service_control_v2' : 'legacy_schedule_pre_cutover',
        });
        return { requestId: requestRef.id, duplicate: false };
      });
      if (eligibility.unavailable) {
        return res.status(503).json({
          status: 'service_unavailable',
          event_type: EVENT_TYPES.BUTTON_PRESS,
        });
      }
      acceptedRequestId = eligibility.requestId;
      duplicate = eligibility.duplicate;
    } else {
      const existingOpenRequests = await dedupeQuery.get();
      if (!existingOpenRequests.empty) {
        acceptedRequestId = existingOpenRequests.docs[0].id;
        duplicate = true;
      } else {
        await requestRef.set({ ...requestDoc, received_at: FieldValue.serverTimestamp() });
      }
    }

    if (duplicate) {
      console.log('Suppressed duplicate button request because its demand window remains active:', {
        device_id: deviceId,
        existing_request_id: acceptedRequestId,
      });
      return res.status(200).json({
        status: 'accepted',
        event_type: EVENT_TYPES.BUTTON_PRESS,
        request_id: acceptedRequestId,
        duplicate: true,
      });
    }

    console.log('Fairway button request stored:', {
      request_id: acceptedRequestId,
      device_id: deviceId,
      event_type: eventType
    });

    return res.status(200).json({
      status: 'accepted',
      event_type: EVENT_TYPES.BUTTON_PRESS,
      request_id: acceptedRequestId,
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

    const versionedService = hierarchy.course?.service_schema_version === 2;
    const available = versionedService
      ? hierarchy.course.service_status === 'on'
      : !hierarchy.course || resolveCourseServiceState(hierarchy.course, requestTime).active;
    if (hierarchy.course && !available) {
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
      console.warn('Rejected operator request with invalid Firebase ID token:', error.message || error);
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
    if (getApps().length === 0) {
      initializeApp({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FAIRWAY_GCP_PROJECT,
      });
    }
    return getAuth();
  }

  async function listAdminUsers(req, res) {
    try {
      const authUsers = [];
      const authUids = new Set();
      const pageTokens = new Set();
      let pageToken;
      const auth = authClient();

      do {
        // eslint-disable-next-line no-await-in-loop
        const page = await auth.listUsers(1000, pageToken);
        if (!page || !Array.isArray(page.users) ||
            (page.pageToken !== undefined && page.pageToken !== null &&
              typeof page.pageToken !== 'string')) {
          throw new AdminDirectoryError(
            'user_directory_unavailable',
            'The complete user directory could not be retrieved. Retry.'
          );
        }
        for (const user of page.users) {
          if (!user || typeof user.uid !== 'string' || !user.uid || authUids.has(user.uid)) {
            throw new AdminDirectoryError(
              'user_directory_unavailable',
              'The complete user directory could not be retrieved. Retry.'
            );
          }
          authUids.add(user.uid);
          authUsers.push(user);
          if (authUsers.length > MAX_ADMIN_DIRECTORY_ENTRIES) {
            throw new AdminDirectoryError(
              'user_directory_too_large',
              'The complete user directory exceeds the supported size; no partial list was returned.'
            );
          }
        }

        pageToken = page.pageToken || undefined;
        if (pageToken) {
          if (pageTokens.has(pageToken)) {
            throw new AdminDirectoryError(
              'user_directory_unavailable',
              'The complete user directory could not be retrieved. Retry.'
            );
          }
          pageTokens.add(pageToken);
        }
      } while (pageToken);

      const accessSnapshot = await db.collection('user_access')
        .limit(MAX_ADMIN_DIRECTORY_ENTRIES + 1)
        .get();
      if (accessSnapshot.size > MAX_ADMIN_DIRECTORY_ENTRIES) {
        throw new AdminDirectoryError(
          'user_directory_too_large',
          'The complete user directory exceeds the supported size; no partial list was returned.'
        );
      }

      const records = new Map(accessSnapshot.docs.map((doc) => [doc.id, doc]));
      const orphanRecords = accessSnapshot.docs.filter((doc) => !authUids.has(doc.id));
      if (authUsers.length + orphanRecords.length > MAX_ADMIN_DIRECTORY_ENTRIES) {
        throw new AdminDirectoryError(
          'user_directory_too_large',
          'The complete user directory exceeds the supported size; no partial list was returned.'
        );
      }

      const customerCoursesCache = new Map();
      const users = [];
      for (const user of authUsers) {
        const accessRecord = records.get(user.uid);
        if (!accessRecord) {
          users.push({
            uid: user.uid,
            email: user.email || null,
            display_name: user.displayName || null,
            disabled: user.disabled === true,
            status: 'NOT PROVISIONED',
            access_record_present: false,
            access_record_valid: null,
            authorization: null,
          });
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const authorization = await validateAccessRecord(
          db,
          accessRecord.data(),
          customerCoursesCache
        );
        users.push({
          uid: user.uid,
          email: user.email || null,
          display_name: user.displayName || null,
          disabled: user.disabled === true,
          status: authorization ? 'PROVISIONED' : 'CONFIGURATION ERROR',
          access_record_present: true,
          access_record_valid: Boolean(authorization),
          authorization,
        });
      }

      for (const accessRecord of orphanRecords) {
        // eslint-disable-next-line no-await-in-loop
        const authorization = await validateAccessRecord(
          db,
          accessRecord.data(),
          customerCoursesCache
        );
        users.push({
          uid: accessRecord.id,
          email: null,
          display_name: null,
          disabled: null,
          status: 'ORPHANED RECORD',
          access_record_present: true,
          access_record_valid: Boolean(authorization),
          authorization,
        });
      }

      const response = {
        complete: true,
        users,
        next_page_token: null,
      };
      if (Buffer.byteLength(JSON.stringify(response), 'utf8') >
          MAX_ADMIN_DIRECTORY_RESPONSE_BYTES) {
        throw new AdminDirectoryError(
          'user_directory_too_large',
          'The complete user directory exceeds the supported response size; no partial list was returned.'
        );
      }
      return res.status(200).json(response);
    } catch (error) {
      if (error instanceof AdminDirectoryError) throw error;
      console.error(
        'Admin user directory reconciliation failed:',
        error.code || error.message || 'unclassified error'
      );
      throw new AdminDirectoryError(
        'user_directory_unavailable',
        'The complete user directory could not be retrieved. Retry.'
      );
    }
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

    if (!body.admin && protectedSystemAdminUids.includes(uid)) {
      return res.status(403).json({ error: 'protected_system_admin' });
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
    const current = serviceState(course);
    return {
      customer_id: course.customer_id,
      course_id: course.course_id,
      course_name: course.course_name,
      timezone: course.timezone,
      service_state: current,
      service_coverage_started_at: course.service_coverage_started_at || null,
    };
  }

  function operatorCourseServiceModel(course) {
    return course;
  }

  async function getOperatorServiceState(req, res) {
    res.set('Cache-Control', 'no-store');
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    const customerId = req.query?.customer_id;
    const courseId = req.query?.course_id;
    if (typeof customerId !== 'string' || typeof courseId !== 'string') {
      return res.status(400).json({ error: 'invalid_course_context' });
    }
    const course = await authorizedCourse(operator, courseId, customerId);
    if (!course) return res.status(403).send('Operator is not authorized for this Course\n');
    return res.status(200).json({
      customer_id: course.customer_id,
      course_id: course.course_id,
      course_name: course.course_name,
      timezone: course.timezone,
      service_state: serviceState(course),
    });
  }

  async function getOperatorDashboard(req, res) {
    res.set('Cache-Control', 'no-store');
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
    const requestsByCourse = new Map(courses.map((course, index) => [
      course.course_id,
      requestSnapshots[index].docs.map((document) => ({
        request_id: document.id,
        ...document.data(),
        course_id: course.course_id,
      })),
    ]));
    const intervalSnapshots = await Promise.all(courses.map((course) => {
      if (course.service_schema_version !== 2) return Promise.resolve(null);
      return coursesCollection(db, course.customer_id).doc(course.course_id)
        .collection('service_intervals').get();
    }));
    const intervalsByCourse = new Map(courses.map((course, index) => [
      course.course_id,
      intervalSnapshots[index]?.docs.map((document) => ({
        interval_id: document.id,
        ...document.data(),
      })) || [],
    ]));
    const report = summarizeOperatorDashboard(courses, requestsByCourse, intervalsByCourse, requestTime);
    return res.status(200).json({
      courses: serviceCourses.map(operatorCourseServiceModel),
      summaries: report.summaries,
      history: report.history,
      history_coverage: report.history_coverage,
    });
  }

  async function updateCourseService(req, res, action) {
    const operator = await authorizeOperator(req, res);
    if (!operator) return res;
    const courseId = req.body?.course_id;
    const course = await authorizedCourse(operator, courseId, req.body?.customer_id);
    if (!course) return res.status(403).send('Operator is not authorized for this Course\n');
    if (!serviceControlV2Active) {
      return res.status(503).json({ error: 'service_control_not_activated' });
    }
    if (!req.body?.operation_id || !Number.isInteger(req.body.expected_generation)) {
      return res.status(426).json({
        error: 'operator_update_required',
        message: 'Update or refresh Cart Operator before changing service.',
      });
    }
    const result = await transitionCourseService(db, {
      customerId: course.customer_id,
      courseId: course.course_id,
      actorId: operator.identity.uid,
      action,
      operationId: req.body?.operation_id,
      expectedGeneration: req.body?.expected_generation,
      fieldValue: FieldValue,
    });
    return res.status(200).json(result);
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
    if (error instanceof ServiceControlError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof CredentialLifecycleError) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
      });
    }
    if (error instanceof AdminDirectoryError) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
      });
    }
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
          service_schema_version: courseSource.service_schema_version ?? null,
          service_status: courseSource.service_status ?? null,
          comments: courseSource.comments ?? null,
        };
        course.field_status = Object.fromEntries(['course_name', 'timezone', 'comments']
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
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'service_schedule')) {
      return res.status(409).json({
        error: 'service_schedule_removed',
        message: 'Refresh Admin before creating a Course. New Courses start with service off.',
      });
    }
    requireBodyFields(req.body, ['course_name', 'timezone', 'comments']);
    const course = await createCourse(db, {
      customerId,
      courseName: req.body.course_name,
      timezone: req.body.timezone,
      comments: req.body.comments,
    });
    return res.status(201).json(course);
  }

  async function patchAdminCourse(req, res, customerId, courseId) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'service_schedule')) {
      return res.status(409).json({
        error: 'service_schedule_removed',
        message: 'Recurring service schedules are no longer supported. Refresh Admin and update only Course details.',
      });
    }
    requireBodyFields(req.body, ['course_name', 'timezone', 'comments']);
    const course = await updateCourse(db, customerId, courseId, {
      courseName: req.body.course_name,
      timezone: req.body.timezone,
      comments: req.body.comments,
    });
    return res.status(200).json(course);
  }

  async function cutoverAdminCourse(req, res, customerId, courseId) {
    if (Object.keys(req.body || {}).length !== 0) {
      return res.status(400).json({ error: 'invalid_cutover_request' });
    }
    const course = await getCourseForCustomer(db, customerId, courseId);
    if (!course) return res.status(404).json({ error: 'course_not_found' });
    return res.status(200).json(await cutoverCourse(db, {
      customerId,
      courseId,
      fieldValue: FieldValue,
      now,
      enabled: serviceControlV2Active,
    }));
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
      const cutoverMatch = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)\/courses\/([^/]+)\/service-cutover$/);
      if (req.method === 'POST' && cutoverMatch) {
        return await cutoverAdminCourse(req, res, cutoverMatch[1], cutoverMatch[2]);
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

      const credentialRotationsMatch = path.match(
        /^\/api\/v1\/admin\/devices\/([^/]+)\/credential-rotations(?:\/([^/]+)(?:\/(activate|cancel))?)?$/
      );
      if (credentialRotationsMatch) {
        const [, deviceId, operationId, action] = credentialRotationsMatch;
        if (req.method === 'POST' && !operationId) {
          requireBodyFields(req.body, ['reason']);
          const result = await prepareCredentialRotation(db, {
            deviceId,
            adminUid: admin.uid,
            reason: req.body.reason,
          });
          const { plaintext_credential: oneTimeCredential, ...rotation } = result;
          return res.status(201).json({
            ...rotation,
            one_time_credential: oneTimeCredential,
          });
        }
        if (req.method === 'GET' && !operationId) {
          return res.status(200).json(await getPendingCredentialRotationStatus(db, deviceId));
        }
        if (req.method === 'GET' && operationId && !action) {
          return res.status(200).json(await getCredentialRotationStatus(db, {
            deviceId,
            operationId,
          }));
        }
        if (req.method === 'POST' && operationId && action === 'activate') {
          requireBodyFields(req.body, ['confirmed']);
          return res.status(200).json(await activateCredentialRotation(db, {
            deviceId,
            operationId,
            adminUid: admin.uid,
            confirmed: req.body.confirmed,
          }));
        }
        if (req.method === 'POST' && operationId && action === 'cancel') {
          requireBodyFields(req.body, ['confirmed']);
          if (req.body.confirmed !== true) {
            throw new CredentialLifecycleError(
              'cancellation_confirmation_required',
              'Explicit cancellation confirmation is required.',
              400
            );
          }
          return res.status(200).json(await cancelCredentialRotation(db, {
            deviceId,
            operationId,
            adminUid: admin.uid,
          }));
        }
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

    const result = await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) return { notFound: true };
      const requestData = requestSnap.data();
      const assignment = operator.assignment.courses.find((course) => (
        course.customer_id === requestData.customer_id &&
        course.course_id === requestData.course_id
      ));
      if (!assignment) return { forbidden: true };
      const courseRef = coursesCollection(db, assignment.customer_id).doc(assignment.course_id);
      const courseSnap = await transaction.get(courseRef);
      if (!courseSnap.exists || !isValidIanaTimezone(courseSnap.data().timezone)) {
        return { invalid: true };
      }
      const course = courseSnap.data();
      const currentStatus = requestData.status;
      if (action === 'confirm' && !['new', 'confirmed'].includes(currentStatus)) return { conflict: true };
      if (action === 'complete' && currentStatus === 'cancelled') return { conflict: true };
      if (action === 'cancel' && currentStatus === 'completed') return { conflict: true };
      if (action === 'complete' && ['new', 'confirmed'].includes(currentStatus)) {
        const receivedAt = toDate(requestData.received_at);
        if (!receivedAt || localDate(receivedAt, course.timezone) < localDate(now(), course.timezone)) {
          return { priorDay: true };
        }
      }
      let commandRef = null;
      let commandSnap = null;
      if (action === COMPLETE_COMMAND_TYPE) {
        const expiresAt = toDate(requestData.demand_window_expires_at);
        if (typeof requestData.device_id !== 'string' || !expiresAt) return { invalid: true };
        const commandId = completeCommandId(requestId);
        commandRef = db.collection('devices').doc(requestData.device_id)
          .collection('commands').doc(commandId);
        commandSnap = await transaction.get(commandRef);
      }
      if (currentStatus !== actionConfig.status) {
        transaction.update(requestRef, {
          status: actionConfig.status,
          [actionConfig.timestampField]: FieldValue.serverTimestamp(),
          operator_id: operator.identity.uid,
        });
      }
      if (commandRef && !commandSnap.exists) {
        transaction.set(commandRef, {
          command_id: commandRef.id,
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
      return {
        commandId: commandRef?.id,
        created: Boolean(commandRef && !commandSnap.exists),
        deviceId: requestData.device_id,
        changed: currentStatus !== actionConfig.status,
      };
    });

    if (result.notFound) return res.status(404).send('Request not found\n');
    if (result.forbidden) return res.status(403).send('Operator is not authorized for this Course\n');
    if (result.invalid) return res.status(422).send('Request or Course is missing valid completion data\n');
    if (result.conflict) return res.status(409).send('Request is already in a conflicting terminal state\n');
    if (result.priorDay) {
      return res.status(409).json({
        error: 'prior_day_request_requires_cancellation',
        message: 'Requests received on a prior Course-local calendar day must be cancelled, not completed.',
      });
    }
    if (result.commandId) {
      console.log('COMPLETE command correlation:', {
        request_id: requestId,
        command_id: result.commandId,
        device_id: result.deviceId,
        created: result.created,
      });
    }

    console.log('Fairway request status updated:', {
      request_id: requestId,
      status: actionConfig.status,
      changed: result.changed,
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
      if (req.method === 'GET' && path === '/api/v1/operator/service-state') {
        return await getOperatorServiceState(req, res);
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
      if (error instanceof ServiceControlError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
      }
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
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
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

module.exports = { createFairwayHandlers, resolveProtectedSystemAdminUids };