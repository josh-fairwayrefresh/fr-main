#!/usr/bin/env node
'use strict';

const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { resolveSandboxEnvironment } = require('../lib/environment');
const { createCustomer } = require('../lib/fleet/customers');
const { createCourse } = require('../lib/fleet/courses');
const { createDevice, replaceDeviceCredential, updateDeviceState } = require('../lib/fleet/devices');

const SYNTHETIC_MARKER = 'WP5-S1 SYNTHETIC SANDBOX DATA - NOT A PHYSICAL DEVICE';

async function main() {
  const environment = resolveSandboxEnvironment();
  const db = new Firestore({ projectId: environment.projectId });

  const existing = await db.collection('customers')
    .where('comments', '==', SYNTHETIC_MARKER)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new Error('Synthetic WP5-S1 sandbox data already exists; refusing to duplicate it');
  }

  const customer = await createCustomer(db, {
    customerName: 'Sandbox Links Golf',
    comments: SYNTHETIC_MARKER,
  });
  const course = await createCourse(db, {
    customerId: customer.customer_id,
    courseName: 'Validation Course',
    timezone: 'America/Los_Angeles',
    serviceSchedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
    comments: SYNTHETIC_MARKER,
  });
  const device = await createDevice(db, {
    comments: SYNTHETIC_MARKER,
    simIccid: '8900000000000000000',
    hardwareRevision: 'Synthetic WP5-S1',
    firmwareGeneration: 'Synthetic WP5-S1',
  });
  await updateDeviceState(db, device.device_id, 'deployed', {
    customerId: customer.customer_id,
    courseId: course.course_id,
    location: { type: 'hole', hole: 4 },
  });

  const credential = await replaceDeviceCredential(db, device.device_id);
  credential.secret = null;

  await db.collection('requests').add({
    customer_id: customer.customer_id,
    course_id: course.course_id,
    course_name: course.course_name,
    device_id: device.device_id,
    device_label: 'Hole 4',
    hole: 4,
    event_type: 'button_press',
    transaction_id: 'synthetic-seed',
    status: 'new',
    source: 'wp5-s1-synthetic-seed',
    received_at: FieldValue.serverTimestamp(),
    confirmed_at: null,
    completed_at: null,
    operator_id: null,
    repeat_press_count: 0,
    last_repeat_press_at: null,
    demand_window_expires_at: new Date(Date.now() + 5 * 60 * 1000),
    device_state_at_request: 'deployed',
    course_local_date: null,
    course_local_hour: null,
    raw_payload: { synthetic: true },
  });

  console.log(JSON.stringify({
    project_id: environment.projectId,
    synthetic_only: true,
    customer_id: customer.customer_id,
    course_id: course.course_id,
    device_id: device.device_id,
    credential_plaintext_discarded: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Sandbox seed failed: ${error.message}`);
  process.exitCode = 1;
});
