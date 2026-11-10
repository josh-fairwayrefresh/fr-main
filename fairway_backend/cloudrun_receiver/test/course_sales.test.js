'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { closeoutTotalsByDay, readCourseSales } = require('../lib/course_sales');

const course = { timezone: 'America/Los_Angeles' };
const days = ['2026-10-17', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
const start = new Date('2026-10-17T07:00:00Z');
const end = new Date('2026-11-04T08:00:00Z');

function courseDoc(db) {
  return db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001');
}

async function closure(db, id, closedAt, amountMinor) {
  await courseDoc(db).collection('inventory_shift_closures').doc(id)
    .set({ shift_id: id, status: 'closed', amount_minor: amountMinor, currency_code: 'USD', closed_at: new Date(closedAt) });
}

test('close-outs are summed per Course-local day', () => {
  const totals = closeoutTotalsByDay([
    { amount_minor: 1000, currency_code: 'USD', closed_at: new Date('2026-10-30T22:00:00Z') },
    { amount_minor: 250, currency_code: 'USD', closed_at: new Date('2026-10-31T06:30:00Z') },
    { amount_minor: 500, currency_code: 'USD', closed_at: new Date('2026-10-31T07:30:00Z') },
    { amount_minor: -1, closed_at: new Date('2026-10-31T20:00:00Z') },
  ], 'America/Los_Angeles');
  assert.deepEqual([...totals], [['2026-10-30', { total_minor: 1250, count: 2 }], ['2026-10-31', { total_minor: 500, count: 1 }]]);
});

test('the register syncs close-out days, keeps manual entries and leaves unrecorded days blank', async () => {
  const db = new FakeFirestore();
  const register = courseDoc(db).collection('sales_days');
  await register.doc('2026-10-17').set({ day: '2026-10-17', total_minor: 143527, currency_code: 'USD', source: 'paper_record' });
  await register.doc('2026-10-30').set({ day: '2026-10-30', total_minor: 18780, currency_code: 'USD', source: 'reviewed_correction' });
  await closure(db, 'a', '2026-10-30T22:43:45Z', 18780);
  await closure(db, 'b', '2026-10-30T22:47:51Z', 18780);
  await closure(db, 'c', '2026-10-31T17:22:00Z', 30000);
  await closure(db, 'd', '2026-11-01T00:22:00Z', 30291);
  await closure(db, 'e', '2026-11-03T20:00:00Z', 5000);
  const now = new Date('2026-11-02T21:00:00Z');
  const sales = await readCourseSales(db, { customerId: 'CUST-0001', courseId: 'COURSE-0001', course, days,
    today: '2026-11-02', start, end, now });
  assert.deepEqual([...sales], [['2026-10-17', 143527], ['2026-10-30', 18780], ['2026-10-31', 60291]]);
  const synced = (await register.doc('2026-10-31').get()).data();
  assert.equal(synced.source, 'closeout');
  assert.equal(synced.closeout_count, 2);
  assert.equal((await register.doc('2026-10-30').get()).data().source, 'reviewed_correction');
  assert.equal((await register.doc('2026-11-03').get()).exists, false, 'future days are not synced');

  await closure(db, 'f', '2026-11-01T01:00:00Z', 709);
  const later = await readCourseSales(db, { customerId: 'CUST-0001', courseId: 'COURSE-0001', course, days,
    today: '2026-11-02', start, end, now });
  assert.equal(later.get('2026-10-31'), 61000, 'a later close-out updates a synced day');
});
