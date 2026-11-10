'use strict';

const { FieldPath, Timestamp } = require('@google-cloud/firestore');
const { ButtonReportError, MAX_RECORDS } = require('./button_activity_report');
const { deriveDisplayLabelFromLocation } = require('./fleet/schema');
const { readCourseWeather } = require('./course_weather');
const { readCourseSales } = require('./course_sales');

async function collectRequestPages(getPage) {
  const rows = [];
  let cursor;
  for (;;) {
    const page = await getPage(cursor);
    rows.push(...page.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    if (rows.length > MAX_RECORDS) throw new ButtonReportError('Too many request records. Choose a shorter range.', 413);
    if (page.docs.length < 500) return rows;
    cursor = page.docs[page.docs.length - 1];
  }
}

function createReportSources(db, { fetchImpl = (...args) => fetch(...args) } = {}) {
  const deadline = Date.now() + 45000;
  function checkDeadline() {
    if (Date.now() >= deadline) throw new ButtonReportError('Generation exceeded 45 seconds. Choose a shorter range and retry.', 503);
  }
  return {
    async currentLabels({ deviceIds, courseId }) {
      checkDeadline();
      const devices = await Promise.all(deviceIds.map(id => db.collection('devices').doc(id).get())).catch(error => {
        console.error('Button report device read failed:', { code: error.code, message: error.message });
        throw new ButtonReportError('Device registry read failed. Retry.', 503);
      });
      return Object.fromEntries(devices.filter(doc => doc.exists && doc.data().course_id === courseId)
        .map(doc => [doc.id, deriveDisplayLabelFromLocation(doc.data().location)]).filter(([, label]) => label));
    },
    // Same On-course Resume/Suspend stream and read shape as Cart KPI Active Cart Hours.
    async serviceEvents({ start, end, customerId, courseId }) {
      checkDeadline();
      const events = db.collection('customers').doc(customerId).collection('courses').doc(courseId)
        .collection('service_events');
      const [prior, period] = await Promise.all([
        events.where('recorded_at', '<', start).orderBy('recorded_at', 'desc').limit(1).get(),
        events.where('recorded_at', '>=', start).where('recorded_at', '<=', end).orderBy('recorded_at', 'asc')
          .limit(MAX_RECORDS + 1).get(),
      ]).catch(error => {
        console.error('Button report service event read failed:', { code: error.code, message: error.message });
        throw new ButtonReportError('Service hours read failed. Retry.', 503);
      });
      if (period.size > MAX_RECORDS) throw new ButtonReportError('Too many service records. Choose a shorter range.', 413);
      return [...prior.docs, ...period.docs].map(doc => doc.data());
    },
    // Reviewed service start/end corrections, keyed by Course-local day.
    async serviceCorrections({ customerId, courseId, days }) {
      checkDeadline();
      const register = db.collection('customers').doc(customerId).collection('courses').doc(courseId)
        .collection('service_days');
      const docs = await Promise.all(days.map(day => register.doc(day).get())).catch(error => {
        console.error('Button report service correction read failed:', { code: error.code, message: error.message });
        throw new ButtonReportError('Service hours read failed. Retry.', 503);
      });
      return new Map(docs.filter(doc => doc.exists && doc.data().source === 'reviewed_correction')
        .map(doc => [doc.id, doc.data()]));
    },
    // Weather is supplementary: any failure leaves the report without it.
    async weather({ customerId, courseId, course, days, today, now }) {
      checkDeadline();
      return readCourseWeather(db, { customerId, courseId, course, days, today, now, fetchImpl }).catch(error => {
        console.error('Button report weather read failed:', { code: error.code, message: error.message });
        return null;
      });
    },
    // Total sales are supplementary: any failure leaves the report without them.
    async sales({ customerId, courseId, course, days, today, start, end, now }) {
      checkDeadline();
      return readCourseSales(db, { customerId, courseId, course, days, today, start, end, now }).catch(error => {
        console.error('Button report total sales read failed:', { code: error.code, message: error.message });
        return null;
      });
    },
    async requests({ start, end, asOf, customerId, courseId, endExclusive }) {
      return db.runTransaction(async transaction => {
        const query = db.collection('requests')
          .where('customer_id', '==', customerId).where('course_id', '==', courseId)
          .where('received_at', '>=', start).where('received_at', endExclusive ? '<' : '<=', end)
          .orderBy('received_at', 'desc').orderBy(FieldPath.documentId(), 'desc')
          .select('customer_id', 'course_id', 'device_id', 'received_at', 'completed_at', 'status', 'source', 'event_type', 'reporting_state', 'rejection_reason',
            'cancelled_at', 'device_label', 'hole')
          .limit(500);
        const rows = await collectRequestPages(cursor => {
          checkDeadline();
          return transaction.get(cursor ? query.startAfter(cursor) : query).then(snapshot => {
            checkDeadline();
            return snapshot;
          });
        });
        rows.readTime = asOf.toISOString();
        return rows;
      }, { readOnly: true, readTime: Timestamp.fromDate(asOf) }).catch(error => {
        if (error instanceof ButtonReportError) throw error;
        console.error('Button report Firestore read failed:', { code: error.code, message: error.message });
        throw new ButtonReportError('Firestore report read failed. Check index/runtime permissions and retry.', 503);
      });
    },
  };
}

module.exports = { createReportSources, collectRequestPages };
