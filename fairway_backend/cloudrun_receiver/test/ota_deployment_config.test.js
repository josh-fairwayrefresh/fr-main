'use strict';

const assert = require('node:assert/strict');
const exclusion = require('../config/ota-artifact-log-exclusion.json');

assert.equal(exclusion.disabled, false);
assert.match(exclusion.name, /^[a-z0-9-]+$/);
assert.equal(exclusion.filter,
  'resource.type="cloud_run_revision" AND httpRequest.requestUrl =~ "/api/v1/device-ota/artifacts/"');
assert.doesNotMatch(exclusion.filter, /sample\(|severity|service_name|revision_name/);
console.log('PASS: artifact bearer-path exclusion is enabled, unsampled and covers all receiver revisions/status codes');
