'use strict';

process.env.FAIRWAY_OPERATIONAL_STORAGE = 'customer';
const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { generateButtonReport } = require('../lib/button_activity_report');
const { createReportSources } = require('../lib/button_report_sources');

test('Customer report retains projected ownership and outcomes for historical and current requests', async () => {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('CUST-0001');
  await customer.set({ customer_name: 'Synthetic Customer', operational_storage: { state: 'customer' } });
  await customer.collection('services').doc('COURSE-0001').set({
    service_id: 'COURSE-0001', course_id: 'COURSE-0001',
    course_name: 'Synthetic Cart Service', timezone: 'America/Los_Angeles',
  });
  for (const day of ['2026-11-11', '2026-11-18']) {
    const at = new Date(`${day}T18:00:00Z`);
    const base = { customer_id: customer.id, course_id: 'COURSE-0001', service_id: 'COURSE-0001',
      device_id: 'FRB-0001', device_label: 'Hole 1', source: 'nrf9151', event_type: 'button_press',
      received_at: at, completed_at: at, cancelled_at: at };
    const rows = {
      completed: { status: 'completed' },
      cancelled: { status: 'cancelled' },
      suspended: { status: 'rejected', rejection_reason: 'service_suspended' },
      rejected: { status: 'rejected', rejection_reason: 'other' },
      pending: { status: 'new' },
      excluded: { status: 'completed', reporting_state: 'excluded' },
      'excluded-cancelled': { status: 'cancelled', reporting_state: 'excluded' },
      'excluded-suspended': { status: 'rejected', rejection_reason: 'service_suspended', reporting_state: 'excluded' },
      qr: { status: 'completed', source: 'qr' },
      'other-event': { status: 'completed', event_type: 'other' },
      'other-customer': { status: 'completed', customer_id: 'CUST-0002' },
      'other-service': { status: 'completed', service_id: 'COURSE-0002' },
      'missing-service': { status: 'completed', service_id: null },
    };
    for (const [id, value] of Object.entries(rows)) {
      await db.collection('requests').doc(`${day}-${id}`).set({ ...base, ...value });
    }
  }
  const adapter = createReportSources(db);
  const source = { requests: adapter.requests, serviceEvents: adapter.serviceEvents,
    currentLabels: adapter.currentLabels, serviceCorrections: adapter.serviceCorrections };
  for (const day of ['2026-11-11', '2026-11-18']) {
    const report = await generateButtonReport(db, {
      customer_id: customer.id, course_id: 'COURSE-0001', start_date: day, end_date: day,
    }, { asOf: new Date('2026-11-18T23:00:00Z'), source });
    assert.deepEqual(report.totals, { completed: 1, suspended: 1, cancelled: 1, cart_hours: 0 });
    assert.deepEqual(report.points.map(point => point.id).sort(),
      ['cancelled', 'completed', 'suspended'].map(id => `${day}-${id}`));
  }
});
