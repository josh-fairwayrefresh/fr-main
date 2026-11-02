'use strict';

// Total Sales Register: customers/{c}/courses/{k}/sales_days/{YYYY-MM-DD} holds
// each Course-local day's total sales in cents. Days come from operator shift
// close-outs (inventory_shift_closures, summed per day) or from reviewed manual
// entries (prior paper records and corrections). Manual entries are never
// overwritten by close-out sync.

const SALES_SUBCOLLECTION = 'sales_days';
const CLOSEOUT_SOURCE = 'closeout';
const MANUAL_SOURCES = new Set(['paper_record', 'reviewed_correction']);

function localDay(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(value);
}

function timestampDate(value) {
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  return null;
}

function closeoutTotalsByDay(closures, timezone) {
  const totals = new Map();
  for (const closure of closures) {
    const closedAt = timestampDate(closure.closed_at);
    if (!closedAt || !Number.isSafeInteger(closure.amount_minor) || closure.amount_minor < 0) continue;
    if (closure.currency_code && closure.currency_code !== 'USD') continue;
    const day = localDay(closedAt, timezone);
    const current = totals.get(day) || { total_minor: 0, count: 0 };
    totals.set(day, { total_minor: current.total_minor + closure.amount_minor, count: current.count + 1 });
  }
  return totals;
}

function salesRegister(db, customerId, courseId) {
  return db.collection('customers').doc(customerId).collection('courses').doc(courseId).collection(SALES_SUBCOLLECTION);
}

// Syncs close-out days in [start, end) into the register and returns Map(day -> total_minor).
async function readCourseSales(db, { customerId, courseId, course, days, today, start, end, now = new Date() }) {
  const wanted = days.filter(day => day <= today);
  if (!wanted.length) return new Map();
  const register = salesRegister(db, customerId, courseId);
  const [docs, closures] = await Promise.all([
    Promise.all(wanted.map(day => register.doc(day).get())),
    db.collection('customers').doc(customerId).collection('courses').doc(courseId)
      .collection('inventory_shift_closures').where('closed_at', '>=', start).where('closed_at', '<', end).get(),
  ]);
  const stored = new Map();
  docs.forEach((doc, index) => { if (doc.exists) stored.set(wanted[index], doc.data()); });
  const closeouts = closeoutTotalsByDay(closures.docs.map(doc => doc.data()), course.timezone || 'UTC');
  const batch = db.batch();
  let writes = 0;
  for (const day of wanted) {
    const closeout = closeouts.get(day);
    const row = stored.get(day);
    if (!closeout || MANUAL_SOURCES.has(row?.source)) continue;
    if (row?.source === CLOSEOUT_SOURCE && row.total_minor === closeout.total_minor && row.closeout_count === closeout.count) continue;
    const next = { day, total_minor: closeout.total_minor, currency_code: 'USD', source: CLOSEOUT_SOURCE,
      closeout_count: closeout.count, closeout_total_minor: closeout.total_minor, updated_at: now };
    stored.set(day, next);
    batch.set(register.doc(day), next);
    writes += 1;
  }
  if (writes) {
    await batch.commit().catch(error => {
      console.error('Total sales register sync failed:', { courseId, message: error.message });
    });
  }
  return new Map(wanted.filter(day => Number.isSafeInteger(stored.get(day)?.total_minor))
    .map(day => [day, stored.get(day).total_minor]));
}

module.exports = { SALES_SUBCOLLECTION, MANUAL_SOURCES, closeoutTotalsByDay, readCourseSales, localDay };
