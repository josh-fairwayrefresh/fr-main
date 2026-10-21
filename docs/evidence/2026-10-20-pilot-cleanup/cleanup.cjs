'use strict';

// Historical one-time review artifact: cleanup already executed; not reusable production tooling.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '../../..');
const requireProduct = createRequire(path.join(ROOT, 'fairway_backend/cloudrun_receiver/package.json'));
const { OAuth2Client } = requireProduct('google-auth-library');

const PROJECT = 'savvy-kit-496703-r5';
const DB = `projects/${PROJECT}/databases/(default)`;
const PREFIX = `${DB}/documents/`;
const BASE = `https://firestore.googleapis.com/v1/${DB}/documents`;
const CUTOFF = '2026-10-17T16:39:35.270Z';
const PROTECTED = 'bUgIybnJz0Xv7YMdz2Pm';
const MANIFEST = path.join(__dirname, 'manifest.json');
const PROGRESS = path.join(__dirname, 'progress.jsonl');
const EXPECTED = { requests: 498, modern: 312, legacy: 186, commands: 307, dispatches: 728 };
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
const string = (d, f) => d.fields?.[f]?.stringValue ?? null;
const relative = (d) => d.name.slice(PREFIX.length);
const requestId = (d) => relative(d).split('/')[1];

function timestamp(t) {
  const m = typeof t === 'string' && t.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/);
  assert(m && Number.isFinite(Date.parse(t)), 'Invalid/missing timestamp');
  return `${m[1]}.${(m[2] || '').padEnd(9, '0')}Z`;
}
function candidate(d) {
  const t = timestamp(d.fields?.received_at?.timestampValue);
  return requestId(d) !== PROTECTED && t < timestamp(CUTOFF);
}
function guardPath(p, id) {
  assert(id !== PROTECTED && !id.includes('/'), 'Protected/invalid request ID');
  assert(
    p === `requests/${id}` ||
    /^devices\/[^/]+\/commands\/[^/]+$/.test(p) ||
    p.startsWith(`notification_dispatches/${id}/subscriptions/`) && p.split('/').length === 4,
    'Path outside approved allowlist'
  );
}
function versions(expected, actual, allowMissing) {
  const map = new Map(actual.map((d) => [relative(d), d.updateTime]));
  for (const e of expected) {
    const current = map.get(e.path);
    assert(current || allowMissing, `Unexpected absence: ${e.path}`);
    if (current) assert.equal(current, e.version, `Unexpected mutation: ${e.path}`);
  }
}
function baseline() {
  assert.equal(git('branch', '--show-current').trim(), 'main');
  assert.equal(git('rev-parse', 'HEAD').trim(), '3c70befb5b97a8f987f6b08a72804079b7b0da48');
  assert.equal(git('diff', 'HEAD', '--name-only'), '');
  assert.equal(git('diff', '--cached', 'HEAD', '--name-only'), '');
  return {
    status: git('status', '--porcelain', '--untracked-files=all'),
    worktrees: git('worktree', 'list', '--porcelain'),
    ignored: git('ls-files', '--others', '--ignored', '--exclude-standard', '-z'),
    incidental: git('ls-files', '--others', '--exclude-standard').trim().split('\n').map((p) => ({
      path: p, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex'),
    })),
  };
}
function metadata(d) {
  return { path: relative(d), version: d.updateTime };
}
async function parallel(items, fn, concurrency = 6) {
  let index = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < items.length) await fn(items[index++]);
  }));
}
class API {
  constructor() {
    this.auth = new OAuth2Client();
    this.auth.setCredentials({
      access_token: execFileSync('gcloud', ['auth', 'print-access-token'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
      expiry_date: Date.now() + 1800000,
    });
  }
  async call(suffix, data, method = 'POST') {
    return (await this.auth.request({ url: BASE + suffix, data, method, timeout: 90000 })).data;
  }
  async query(col, fields, readTime, group = true, parent = '') {
    const rows = await this.call(`${parent}:runQuery`, {
      readTime,
      structuredQuery: {
        from: [{ collectionId: col, ...(group ? { allDescendants: true } : {}) }],
        select: { fields: fields.map((fieldPath) => ({ fieldPath })) },
      },
    });
    for (const row of rows) {
      if (row.readTime) assert.equal(Date.parse(row.readTime), Date.parse(readTime));
    }
    return rows.filter((row) => row.document).map((row) => row.document);
  }
  async collections(parent, readTime) {
    const ids = [];
    let pageToken;
    do {
      const response = await this.call(`${parent}:listCollectionIds`, {
        readTime, pageSize: 100, ...(pageToken ? { pageToken } : {}),
      });
      ids.push(...(response.collectionIds || []));
      pageToken = response.nextPageToken;
    } while (pageToken);
    return ids.sort();
  }
}

async function inventory(api) {
  const readTime = new Date(Date.now() - 2000).toISOString();
  const [requests, commands, subscriptions, parents] = await Promise.all([
    api.query('requests', ['received_at', 'customer_id', 'course_id', 'device_id', 'hole', 'status', 'demand_window_expires_at'], readTime, false),
    api.query('commands', ['request_id', 'device_id', 'type'], readTime),
    api.query('subscriptions', ['__name__', 'status', 'lease_until'], readTime),
    api.query('notification_dispatches', ['__name__'], readTime, false),
  ]);
  const cutoff = requests.find((d) => requestId(d) === PROTECTED);
  assert(cutoff, 'Cutoff missing');
  assert.equal(timestamp(cutoff.fields.received_at.timestampValue), timestamp(CUTOFF));
  assert.equal(string(cutoff, 'customer_id'), 'CUST-0001');
  assert.equal(string(cutoff, 'course_id'), 'COURSE-0001');
  assert.equal(string(cutoff, 'device_id'), 'FRB-0003');
  assert.equal(cutoff.fields.hole?.stringValue ?? cutoff.fields.hole?.integerValue, '12');
  const candidates = requests.filter(candidate);
  const ids = new Set(candidates.map(requestId));
  const retainedIds = new Set(requests.filter((d) => !candidate(d)).map(requestId));
  const selectedCommands = commands.filter((d) => ids.has(string(d, 'request_id')));
  const dispatches = subscriptions.filter((d) => relative(d).startsWith('notification_dispatches/'));
  for (const d of commands) {
    assert(/^devices\/[^/]+\/commands\/[^/]+$/.test(relative(d)), 'Unexpected command location');
    assert.equal(string(d, 'type'), 'complete', 'Unexpected command type');
    assert(ids.has(string(d, 'request_id')) || retainedIds.has(string(d, 'request_id')), 'Unresolved command');
  }
  for (const d of dispatches) {
    assert(/^notification_dispatches\/[^/]+\/subscriptions\/[^/]+$/.test(relative(d)), 'Unexpected dispatch path');
    assert(ids.has(requestId(d)) || retainedIds.has(requestId(d)), 'Unresolved dispatch');
  }
  assert.equal(parents.length, 0, 'Unexpected existing dispatch parents');
  const selectedDispatches = dispatches.filter((d) => ids.has(requestId(d)));
  const targets = candidates.map((d) => {
    const id = requestId(d);
    const deps = [
      ...selectedCommands.filter((x) => string(x, 'request_id') === id),
      ...selectedDispatches.filter((x) => requestId(x) === id),
    ];
    const device = string(d, 'device_id');
    assert(device && !device.includes('/'), 'Invalid candidate device ID');
    const commandPath = `devices/${device}/commands/complete__${id}`;
    for (const command of selectedCommands.filter((x) => string(x, 'request_id') === id)) {
      assert.equal(relative(command), commandPath, 'Noncanonical command correlation');
    }
    for (const dep of deps) guardPath(relative(dep), id);
    return { id, records: [d, ...deps].map(metadata), commandPath };
  });
  const open = candidates.filter((d) => ['new', 'confirmed'].includes(string(d, 'status')));
  for (const d of open) {
    assert(timestamp(d.fields.demand_window_expires_at?.timestampValue) < timestamp(readTime), 'Candidate demand window active');
  }
  for (const d of selectedDispatches) {
    assert(!['sending', 'pending'].includes(string(d, 'status')), 'Candidate notification work active');
    const lease = d.fields.lease_until?.timestampValue;
    assert(!lease || timestamp(lease) < timestamp(readTime), 'Candidate notification lease active');
  }
  const requestSubcollections = [];
  await parallel(requests, async (d) => {
    const collections = await api.collections(`/${relative(d)}`, readTime);
    if (collections.length) requestSubcollections.push({ path: relative(d), collections });
  });
  assert.equal(requestSubcollections.length, 0, 'Unexpected request descendants');
  await parallel([...selectedCommands, ...selectedDispatches], async (d) => {
    assert.deepEqual(await api.collections(`/${relative(d)}`, readTime), [], 'Unexpected dependency descendants');
  });
  await parallel(candidates, async (d) => {
    const children = await api.collections(`/notification_dispatches/${requestId(d)}`, readTime);
    assert(children.every((col) => col === 'subscriptions'), 'Unexpected dispatch descendant collection');
  });
  const modern = candidates.filter((d) => string(d, 'customer_id') === 'CUST-0001' && string(d, 'course_id') === 'COURSE-0001').length;
  const summary = {
    snapshot: readTime, totalRequests: requests.length, candidates: candidates.length,
    modern, legacy: candidates.length - modern, commands: selectedCommands.length,
    dispatches: selectedDispatches.length, retainedRequests: retainedIds.size,
    retainedCommands: commands.length - selectedCommands.length,
    retainedDispatches: dispatches.length - selectedDispatches.length,
    oldOpenRequests: open.length, latestCandidateCreateTime: candidates.map((d) => d.createTime).sort().at(-1),
  };
  return { readTime, targets, summary, requests, commands, dispatches, subscriptions };
}

async function protectedInventory(api, readTime) {
  const roots = (await api.collections('', readTime)).filter((col) => !['requests', 'notification_dispatches'].includes(col));
  const result = [];
  const visit = async (parent, col) => {
    // showMissing discovers child collections even when an intermediate parent does not exist.
    const docs = [];
    let token;
    do {
      const params = new URLSearchParams({
        pageSize: '300', showMissing: 'true', readTime, 'mask.fieldPaths': '__name__',
      });
      if (token) params.set('pageToken', token);
      const r = await api.call(`${parent}/${col}?${params}`, undefined, 'GET');
      docs.push(...(r.documents || []));
      token = r.nextPageToken;
    } while (token);
    await parallel(docs, async (d) => {
      if (d.updateTime) result.push(metadata(d));
      const childCols = await api.collections(`/${relative(d)}`, readTime);
      for (const child of childCols) {
        if (col === 'devices' && child === 'commands') continue;
        await visit(`/${relative(d)}`, child);
      }
    }, 3);
  };
  await parallel(roots, (col) => visit('', col), 2);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function selfTest() {
  const doc = (id, t, customer = null) => ({
    name: `${PREFIX}requests/${id}`, updateTime: 'version1',
    fields: { received_at: { timestampValue: t }, customer_id: { stringValue: customer } },
  });
  assert(candidate(doc('legacy', '2026-10-17T16:39:35.269999999Z')));
  assert(candidate(doc('modern', '2026-10-16T00:00:00Z', 'CUST-0001')));
  assert(!candidate(doc(PROTECTED, '2026-01-01T00:00:00Z')));
  assert(!candidate(doc('tie', CUTOFF)));
  assert(!candidate(doc('later', '2026-10-17T16:39:35.270000001Z')));
  assert.throws(() => candidate(doc('bad', 'not-a-timestamp')));
  assert.throws(() => guardPath(`requests/${PROTECTED}`, PROTECTED));
  assert.throws(() => guardPath('devices/FRB-0001', 'legacy'));
  assert.throws(() => guardPath('notification_dispatches/retained/subscriptions/s', 'legacy'));
  guardPath('notification_dispatches/legacy/subscriptions/s', 'legacy');
  const expected = [{ path: 'requests/legacy', version: 'version1' }];
  versions(expected, [doc('legacy', CUTOFF)], false);
  assert.throws(() => versions(expected, [{ ...doc('legacy', CUTOFF), updateTime: 'version2' }], false));
  assert.throws(() => versions(expected, [], false));
  versions(expected, [], true);
  const fake = new Map([['requests/legacy', 'v1'], ['devices/d/commands/complete__legacy', 'v1']]);
  const atomic = (entries) => {
    for (const [p, version] of entries) assert.equal(fake.get(p), version);
    for (const [p] of entries) fake.delete(p);
  };
  assert.throws(() => atomic([['requests/legacy', 'v1'], ['devices/d/commands/complete__legacy', 'v2']]));
  assert.equal(fake.size, 2);
  atomic([...fake]);
  assert.equal(fake.size, 0);
  const group = (id, candidates, retained) => candidates.has(id) ? 'delete' : retained.has(id) ? 'retain' : 'unresolved';
  assert.equal(group('legacy', new Set(['legacy']), new Set()), 'delete');
  assert.equal(group('pilot', new Set(), new Set(['pilot'])), 'retain');
  assert.equal(group('unknown', new Set(), new Set()), 'unresolved');
  const unit = { id: 'legacy', commandPath: 'devices/d/commands/complete__legacy', records: expected };
  const planned = new Map(expected.map((r) => [r.path, r.version]));
  assert.equal(deletionWrites(unit, [doc('legacy', '2026-10-01T00:00:00Z')], planned).length, 1);
  assert.equal(deletionWrites(unit, [], planned).length, 0);
  assert.throws(() => deletionWrites(unit, [doc('legacy', CUTOFF)], planned));
  assert.throws(() => deletionWrites(unit, [{ ...doc('legacy', '2026-10-01T00:00:00Z'), updateTime: 'changed' }], planned));
  assert.throws(() => deletionWrites({ ...unit, id: PROTECTED }, [doc(PROTECTED, '2026-10-01T00:00:00Z')], planned));
  console.log('PASS synthetic tests: strict nanosecond boundary, protected ID/ties/later, legacy inclusion, invalid input, path allowlist, dependency classification, version conflicts, atomicity, interrupted-run absence reconciliation.');
}

function deletionWrites(target, current, planned) {
  assert(target.id !== PROTECTED, 'Protected target');
  const parent = current.find((d) => relative(d) === `requests/${target.id}`);
  if (parent) versions(target.records, current, false);
  else assert.equal(current.length, 0, 'Interrupted unit not atomically absent; stop for reconciliation');
  assert(!parent || candidate(parent), 'Request no longer a candidate');
  for (const d of current) {
    const p = relative(d);
    assert.equal(planned.get(p), d.updateTime, `Unexpected dependency/mutation: ${p}`);
    guardPath(p, target.id);
    if (p.startsWith('devices/')) {
      assert.equal(string(d, 'request_id'), target.id);
      assert.equal(string(d, 'type'), 'complete');
    }
  }
  const writes = current.map((d) => ({
    delete: d.name, currentDocument: { updateTime: d.updateTime },
  }));
  assert(writes.length <= 400, 'Request unit exceeds bounded limit');
  return writes;
}

function gcloudJson(args) {
  const formatted = args.some((arg) => arg.startsWith('--format=')) ? args : [...args, '--format=json'];
  return JSON.parse(execFileSync('gcloud', formatted, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
}
async function raceSafety(api, manifest) {
  const fn = gcloudJson([
    'functions', 'describe', 'fairway-request-notifier', '--gen2',
    '--region=us-central1', `--project=${PROJECT}`,
    '--format=json(state,eventTrigger,serviceConfig.timeoutSeconds,buildConfig.source)',
  ]);
  assert.equal(fn.state, 'ACTIVE');
  assert.equal(fn.eventTrigger.eventType, 'google.cloud.firestore.document.v1.created');
  assert(fn.eventTrigger.eventFilters.some((f) => f.attribute === 'document' && f.value === 'requests/{requestId}'));
  assert.equal(fn.serviceConfig.timeoutSeconds, 60);
  assert.equal(fn.buildConfig.source.storageSource.generation, '1790840128801876');
  const subscription = gcloudJson([
    'pubsub', 'subscriptions', 'describe',
    'eventarc-nam5-fairway-request-notifier-108760-sub-456', `--project=${PROJECT}`,
    '--format=json(messageRetentionDuration,deadLetterPolicy)',
  ]);
  assert.equal(subscription.messageRetentionDuration, '86400s');
  assert(!subscription.deadLetterPolicy, 'Unexpected additional event-delivery path');
  const now = Date.now();
  assert(now - Date.parse(manifest.summary.latestCandidateCreateTime) > (86400 + 600 + 60) * 1000,
    'Candidate event can still be in the delivery/retry horizon');
  const metrics = {};
  for (const metric of ['num_undelivered_messages', 'oldest_unacked_message_age']) {
    const params = new URLSearchParams({
      filter: `metric.type="pubsub.googleapis.com/subscription/${metric}" AND resource.type="pubsub_subscription" AND resource.labels.subscription_id="eventarc-nam5-fairway-request-notifier-108760-sub-456"`,
      'interval.startTime': new Date(now - 600000).toISOString(),
      'interval.endTime': new Date(now).toISOString(), view: 'FULL', pageSize: '100',
    });
    const data = (await api.auth.request({
      url: `https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${params}`, timeout: 60000,
    })).data;
    assert(!data.nextPageToken, 'Monitoring pagination unexpected');
    const points = (data.timeSeries || []).flatMap((s) => s.points || []);
    assert(points.length >= 2, 'Insufficient queue monitoring evidence');
    assert(now - Math.max(...points.map((p) => Date.parse(p.interval.endTime))) < 300000, 'Queue evidence stale');
    assert(points.every((p) => Number(p.value.int64Value ?? p.value.doubleValue) === 0), 'Notification queue not empty');
    metrics[metric] = { samples: points.length, latestSample: points[0].interval.endTime, values: 'all zero' };
  }
  const logStart = new Date(now - 86400000).toISOString();
  const logs = gcloudJson([
    'logging', 'read',
    `resource.type="cloud_run_revision" AND resource.labels.service_name="fairway-request-notifier" AND logName="projects/${PROJECT}/logs/run.googleapis.com%2Frequests" AND timestamp>="${logStart}"`,
    `--project=${PROJECT}`, '--limit=1000',
    '--format=json(timestamp,httpRequest.status,httpRequest.latency)',
  ]);
  assert(logs.length < 1000, 'Incomplete invocation-log enumeration');
  assert(logs.every((r) => r.httpRequest?.status >= 200 && r.httpRequest.status < 300),
    'Failed/timed-out notification invocation requires investigation');
  assert(logs.every((r) => now - Date.parse(r.timestamp) > 120000), 'Notifier invocation too recent to demonstrate a drained worker');
  return {
    checkedAt: new Date().toISOString(),
    functionSourceGeneration: fn.buildConfig.source.storageSource.generation,
    candidateEventsOutsideRetentionAndAckHorizon: true,
    metrics, completedInvocationsInLastDay: logs.length,
    latestCompletedInvocation: logs[0]?.timestamp || null,
    invocationStatuses: [...new Set(logs.map((r) => r.httpRequest.status))],
  };
}

async function batchGet(api, records, transaction) {
  const response = await api.call(':batchGet', {
    documents: records.map((p) => PREFIX + p),
    mask: { fieldPaths: ['received_at', 'request_id', 'device_id', 'type', 'status', 'lease_until'] },
    ...(transaction ? { transaction } : {}),
  });
  return response.filter((r) => r.found).map((r) => r.found);
}
async function execute(api, manifest) {
  assert(manifest.raceSafetyVerified === true, 'Race safety gate not satisfied');
  assert(Date.now() - Date.parse(manifest.readTime) < 3600000, 'Preflight stale');
  const before = await inventory(api);
  const planned = new Map(manifest.targets.flatMap((t) => t.records).map((r) => [r.path, r.version]));
  for (const target of before.targets) {
    for (const record of target.records) assert.equal(planned.get(record.path), record.version, `Unplanned/changed candidate: ${record.path}`);
  }
  console.log('Fresh inventory version reconciliation passed.');
  console.log('Fresh race-safety evidence:', JSON.stringify(await raceSafety(api, manifest)));
  for (const target of manifest.targets) {
    const { transaction } = await api.call(':beginTransaction', { options: { readWrite: {} } });
    let committed = false;
    try {
      const paths = [...new Set([...target.records.map((r) => r.path), target.commandPath])];
      const current = await batchGet(api, paths, transaction);
      const writes = deletionWrites(target, current, planned);
      if (writes.length) await api.call(':commit', { transaction, writes });
      else await api.call(':rollback', { transaction });
      committed = true;
      fs.appendFileSync(PROGRESS, JSON.stringify({
        request: target.id, deletedPaths: current.map(relative), reconciledAbsent: target.records.length - current.length,
        completedAt: new Date().toISOString(),
      }) + '\n', { mode: 0o600 });
      if (fs.readFileSync(PROGRESS, 'utf8').trim().split('\n').length % 50 === 0) {
        console.log('Request units completed:', fs.readFileSync(PROGRESS, 'utf8').trim().split('\n').length);
      }
    } finally {
      if (!committed) {
        try { await api.call(':rollback', { transaction }); }
        catch (error) { console.error('Rollback failed:', error.response?.status || error.code); }
      }
    }
  }
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'self-test') return selfTest();
  assert(['preflight', 'safety-check', 'execute', 'verify'].includes(mode), 'Specify self-test/preflight/safety-check/execute/verify');
  const local = baseline();
  const api = new API();
  if (mode === 'preflight') {
    assert(!fs.existsSync(MANIFEST), 'Existing manifest must not be overwritten');
    const data = await inventory(api);
    assert.equal(data.summary.candidates, EXPECTED.requests);
    assert.equal(data.summary.modern, EXPECTED.modern);
    assert.equal(data.summary.legacy, EXPECTED.legacy);
    assert.equal(data.summary.commands, EXPECTED.commands);
    assert.equal(data.summary.dispatches, EXPECTED.dispatches);
    assert.equal(data.summary.oldOpenRequests, 7);
    const targetPaths = new Set(data.targets.flatMap((t) => t.records).map((r) => r.path));
    const protectedRecords = [
      ...data.requests, ...data.commands, ...data.dispatches,
    ].filter((d) => !targetPaths.has(relative(d))).map(metadata);
    const operationalRecords = await protectedInventory(api, data.readTime);
    const manifest = {
      project: PROJECT, database: '(default)', cutoff: CUTOFF, protectedRequest: PROTECTED,
      readTime: data.readTime, targets: data.targets, protectedRecords, operationalRecords,
      local, summary: data.summary, raceSafetyVerified: false,
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ...data.summary, protectedOperationalDocuments: operationalRecords.length }, null, 2));
    console.log('Preflight saved path/version metadata only; execution remains blocked until independent race-safety evidence is verified.');
  } else {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    assert.equal(manifest.project, PROJECT);
    assert.equal(manifest.cutoff, CUTOFF);
    assert.equal(manifest.protectedRequest, PROTECTED);
    if (mode === 'safety-check') {
      const evidence = await raceSafety(api, manifest);
      manifest.raceSafetyEvidence = evidence;
      manifest.raceSafetyVerified = true;
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
      console.log('PASS actual race checks:', JSON.stringify(evidence, null, 2));
    } else if (mode === 'execute') await execute(api, manifest);
    else {
      const data = await inventory(api);
      assert.equal(data.targets.length, 0, 'Pre-cutoff requests remain');
      const ids = new Set(manifest.targets.map((t) => t.id));
      assert(!data.commands.some((d) => ids.has(string(d, 'request_id'))));
      assert(!data.dispatches.some((d) => ids.has(requestId(d))));
      versions(manifest.protectedRecords, [...data.requests, ...data.commands, ...data.dispatches], false);
      const ops = await protectedInventory(api, data.readTime);
      versions(manifest.operationalRecords, ops.map((m) => ({ name: PREFIX + m.path, updateTime: m.version })), false);
      console.log(JSON.stringify({ postSnapshot: data.readTime, remainingCandidates: 0, protectedRetainedVersionsPreserved: manifest.protectedRecords.length, protectedOperationalVersionsPreserved: manifest.operationalRecords.length, requestsNow: data.requests.length, commandsNow: data.commands.length, dispatchDescendantsNow: data.dispatches.length }, null, 2));
    }
  }
  assert.deepEqual(baseline(), local, 'Repository/worktree state changed');
}
main().catch((error) => {
  console.error('STOP:', error.response?.status || error.code || error.message);
  process.exitCode = 1;
});
