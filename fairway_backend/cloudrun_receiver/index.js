const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { authenticateDeviceCredential } = require('./lib/fleet/devices');
const {
  isDeviceCommunicationAllowed,
  deriveHoleFromLocation,
  deriveDisplayLabelFromLocation,
} = require('./lib/fleet/schema');

const db = new Firestore();
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

async function createButtonRequest(req, res) {
  const body = req.body || {};

  const deviceId = body.device_id || body.device || 'unknown_device';
  const eventType = body.event_type || body.event || 'button_press';
  const presentedCredential = req.get(DEVICE_KEY_HEADER);

  const deviceRef = db.collection('devices').doc(deviceId);
const deviceSnap = await deviceRef.get();

if (!deviceSnap.exists) {
  console.warn('Rejected button request from unknown device:', {
    device_id: deviceId
  });

  return res.status(404).send('Unknown device\n');
}

const device = deviceSnap.data();

if (!isDeviceCommunicationAllowed(device.state)) {
  console.warn('Rejected button request from inactive device:', {
    device_id: deviceId
  });

  return res.status(403).send('Inactive device\n');
}

if (!authenticateDeviceCredential(device, presentedCredential)) {
  console.warn('Rejected button request with missing or invalid device credential:', {
    device_id: deviceId
  });

  return res.status(401).send('Unauthorized\n');
}

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

functions.http('fairwayButtonReceiver', async (req, res) => {
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
      return await createButtonRequest(req, res);
    }

    return res.status(404).send('Not Found\n');
  } catch (error) {
    console.error('Failed to handle Fairway request:', error);
    return res.status(500).send('Internal Server Error\n');
  }
});