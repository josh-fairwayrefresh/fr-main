'use strict';

const { GoogleAuth } = require('google-auth-library');
const { FieldPath, Timestamp } = require('@google-cloud/firestore');
const { ButtonReportError, MAX_RECORDS, REJECTION_MESSAGE } = require('./button_activity_report');

async function collectLogPages(fetchPage, body) {
  const entries = [];
  const seenTokens = new Set();
  let pageToken;
  for (let page = 0; page < 200; page++) {
    const result = await fetchPage({ ...body, ...(pageToken ? { pageToken } : {}) });
    entries.push(...(result.entries || []));
    if (entries.length > MAX_RECORDS) throw new ButtonReportError('Too many log records. Choose a shorter range.', 413);
    if (!result.nextPageToken) return entries;
    pageToken = result.nextPageToken;
    if (seenTokens.has(pageToken)) throw new ButtonReportError('Logging pagination did not advance.', 502);
    seenTokens.add(pageToken);
  }
  throw new ButtonReportError('Log pagination exceeds practical report limits. Choose a shorter range.', 413);
}

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

function createReportSources(db, { auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }) } = {}) {
  let project;
  const deadline = Date.now() + 45000;
  function checkDeadline() {
    if (Date.now() >= deadline) throw new ButtonReportError('Generation exceeded 45 seconds. Choose a shorter range and retry.', 503);
  }
  async function request(url, data) {
    checkDeadline();
    const client = await auth.getClient();
    try {
      const response = await client.request({ url, method: data ? 'POST' : 'GET', data,
        timeout: Math.max(1, Math.min(20000, deadline - Date.now())), retry: false });
      checkDeadline();
      return response.data;
    } catch (error) {
      if (error instanceof ButtonReportError) throw error;
      console.error('Button report Cloud Logging read failed:', { status: error.response?.status, message: error.message });
      throw new ButtonReportError('Cloud Logging read failed. Check report runtime permissions, source availability and retry.', 503);
    }
  }
  async function projectId() {
    project ||= await auth.getProjectId();
    if (!/^[a-z][a-z0-9-]+$/.test(project || '')) throw new ButtonReportError('Runtime project is unavailable.', 503);
    return project;
  }
  return {
    async retention(asOf) {
      const id = await projectId();
      const bucket = await request(`https://logging.googleapis.com/v2/projects/${id}/locations/global/buckets/_Default`);
      if (bucket.lifecycleState !== 'ACTIVE' || !Number.isInteger(bucket.retentionDays) || bucket.retentionDays < 1) {
        throw new ButtonReportError('Logging retention coverage could not be verified.', 503);
      }
      return { start: new Date(asOf.getTime() - bucket.retentionDays * 86400000).toISOString() };
    },
    async logs({ start, end, courseId }) {
      const id = await projectId();
      return collectLogPages(body => request('https://logging.googleapis.com/v2/entries:list', body), {
        resourceNames: [`projects/${id}/locations/global/buckets/_Default/views/_AllLogs`],
        filter: [
          'resource.type="cloud_run_revision"',
          'resource.labels.service_name="fairway-button-receiver"',
          `timestamp>="${start.toISOString()}"`, `timestamp<="${end.toISOString()}"`,
          `textPayload:"${REJECTION_MESSAGE}"`, `textPayload:"course_id: '${courseId}'"`,
        ].join(' AND '),
        orderBy: 'timestamp asc', pageSize: 1000,
      });
    },
    async requests({ start, end, asOf, customerId, courseId, endExclusive }) {
      return db.runTransaction(async transaction => {
        const query = db.collection('requests')
          .where('customer_id', '==', customerId).where('course_id', '==', courseId)
          .where('received_at', '>=', start).where('received_at', endExclusive ? '<' : '<=', end)
          .orderBy('received_at', 'desc').orderBy(FieldPath.documentId(), 'desc')
          .select('customer_id', 'course_id', 'device_id', 'received_at', 'completed_at', 'status', 'source', 'event_type')
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

module.exports = { createReportSources, collectLogPages, collectRequestPages };
