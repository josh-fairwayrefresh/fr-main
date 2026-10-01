'use strict';

const assert = require('assert');
const { requestIdFromEvent } = require('../notifier');

assert.strictEqual(
  requestIdFromEvent({ subject: 'documents/requests/request-123', data: Buffer.from('protobuf') }),
  'request-123'
);

assert.strictEqual(
  requestIdFromEvent({ data: { value: { name: 'projects/test/databases/(default)/documents/requests/request-456' } } }),
  'request-456'
);

assert.throws(
  () => requestIdFromEvent({ subject: 'documents/devices/FRB-0002' }),
  /does not identify a request document/
);

console.log('3 passed, 0 failed');