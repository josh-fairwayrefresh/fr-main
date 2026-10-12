'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyEmail, parseArgs } = require('../scripts/migrate_user_access');

test('classifies existing monarch email accounts as customer staff', () => {
  assert.equal(classifyEmail('monarchbay_fnb@fairwayrefresh.com'), 'customer_staff');
  assert.equal(classifyEmail('Monarch_cart@fairwayrefresh.com'), 'customer_staff');
});

test('classifies other email accounts as Fairway Refresh staff', () => {
  assert.equal(classifyEmail('staff@fairwayrefresh.com'), 'fairway_staff');
});

test('does not classify missing or malformed email addresses', () => {
  assert.equal(classifyEmail(undefined), null);
  assert.equal(classifyEmail(''), null);
  assert.equal(classifyEmail('no-at-sign'), null);
});

test('requires an explicit Firebase project and defaults to a dry run', () => {
  assert.deepEqual(parseArgs(['--project', 'fairway-refresh-sandbox-260930']), {
    projectId: 'fairway-refresh-sandbox-260930',
    apply: false,
  });
  assert.deepEqual(parseArgs([
    '--project', 'fairway-refresh-sandbox-260930', '--apply',
  ]), {
    projectId: 'fairway-refresh-sandbox-260930',
    apply: true,
  });
  assert.throws(() => parseArgs([]), /explicit --project ID/);
});
