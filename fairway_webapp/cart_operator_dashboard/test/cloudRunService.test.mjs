import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedCloudRunServicePrefix, isExpectedCloudRunUrl } from '../src/lib/cloudRunService.mjs';

test('sandbox receiver and Admin APIs require their separate sandbox services', () => {
  assert.equal(expectedCloudRunServicePrefix('sandbox', 'receiver'), 'fairway-button-receiver-sandbox');
  assert.equal(expectedCloudRunServicePrefix('sandbox', 'admin'), 'fairway-admin-sandbox');
  assert.equal(isExpectedCloudRunUrl('https://fairway-button-receiver-sandbox-123.us-central1.run.app', 'sandbox', 'receiver'), true);
  assert.equal(isExpectedCloudRunUrl('https://fairway-admin-sandbox-123.us-central1.run.app', 'sandbox', 'admin'), true);
  assert.equal(isExpectedCloudRunUrl('https://fairway-button-receiver-sandbox-123.us-central1.run.app', 'sandbox', 'admin'), false);
});

test('production API hosts remain bound to the accepted production project number', () => {
  assert.equal(isExpectedCloudRunUrl('https://fairway-button-receiver-936892386735.us-central1.run.app', 'production', 'receiver'), true);
  assert.equal(isExpectedCloudRunUrl('https://fairway-admin-936892386735.us-central1.run.app', 'production', 'admin'), true);
  assert.equal(isExpectedCloudRunUrl('https://fairway-admin-123456789012.us-central1.run.app', 'production', 'admin'), false);
});