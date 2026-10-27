'use strict';

const { FieldValue } = require('@google-cloud/firestore');

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const actions = {
  confirm: ['confirmed', 'confirmed_at'],
  complete: ['completed', 'completed_at'],
  cancel: ['cancelled', 'cancelled_at'],
};

function completeCommandId(requestId) {
  return `complete__${requestId}`;
}

async function transitionRequest(db, requestId, action, assignment, uid) {
  const config = actions[action];
  if (!config) throw new RequestError(404, 'Unknown request action');
  const ref = db.collection('requests').doc(requestId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new RequestError(404, 'Request not found');
    const request = snapshot.data();
    if (!assignment.courses.some((course) => (
      course.customer_id === request.customer_id && course.course_id === request.course_id
    ))) throw new RequestError(403, 'Operator is not authorized for this Course');

    if (['completed', 'cancelled'].includes(request.status) && request.status !== config[0]) {
      throw new RequestError(409, `Request is already ${request.status}; refresh the queue`);
    }
    if (!['new', 'confirmed', 'completed', 'cancelled'].includes(request.status)) {
      throw new RequestError(409, 'Request has an unsupported state');
    }

    let commandRef;
    let command;
    let bayRef;
    let bay;
    if (action === 'complete' && request.source !== 'qr') {
      const expiry = request.demand_window_expires_at;
      if (typeof request.device_id !== 'string' ||
          !(expiry instanceof Date || typeof expiry?.toDate === 'function')) {
        throw new RequestError(422, 'Request is missing command correlation data');
      }
      commandRef = db.collection('devices').doc(request.device_id)
        .collection('commands').doc(completeCommandId(requestId));
      command = await transaction.get(commandRef);
    }
    if (request.source === 'qr' && ['complete', 'cancel'].includes(action)) {
      if (typeof request.bay_id !== 'string' || !request.bay_id) {
        throw new RequestError(422, 'Request is missing bay correlation data');
      }
      bayRef = db.collection('qr_bays').doc(request.bay_id);
      bay = await transaction.get(bayRef);
    }

    if (request.status !== config[0]) {
      transaction.update(ref, {
        status: config[0],
        [config[1]]: FieldValue.serverTimestamp(),
        operator_id: uid,
      });
    }
    if (commandRef && !command.exists) {
      transaction.set(commandRef, {
        command_id: commandRef.id,
        device_id: request.device_id,
        type: 'complete',
        request_id: requestId,
        status: 'pending',
        created_at: FieldValue.serverTimestamp(),
        expires_at: request.demand_window_expires_at,
        created_by: uid,
        acknowledged_at: null,
      });
    }
    if (bay?.exists && bay.data().active_request_id === requestId) {
      transaction.update(bayRef, { active_request_id: null });
    }
    return { status: config[0] };
  });
}

module.exports = { RequestError, transitionRequest, completeCommandId };
