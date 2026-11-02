'use strict';

const { FieldPath, Timestamp } = require('@google-cloud/firestore');
const { ButtonReportError, MAX_RECORDS } = require('./button_activity_report');
const { deriveDisplayLabelFromLocation } = require('./fleet/schema');

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

function createReportSources(db) {
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
