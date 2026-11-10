'use strict';

const { PRODUCTION_FINGERPRINT } = require('../lib/ota/accepted_releases');
const { HARDWARE_ID } = require('../lib/ota/ota_service');

function approval(sha256, ids = ['FRB-0005']) {
  return {
    sha256, verification_record: 'LOCAL TEST ONLY: verified',
    cpo_approval_record: 'LOCAL TEST ONLY: approved',
    alignment_record: 'LOCAL TEST ONLY: alignment register',
    source_commit: 'a'.repeat(40), release_record_commit: 'b'.repeat(40),
    remote_backup_record: 'LOCAL TEST ONLY: remote-backed evidence',
    publication_authorization_record: 'LOCAL TEST ONLY: publication authorized',
    device_ids: ids,
  };
}

function capability(schedule = 'nightly') {
  return {
    verified: true, hardware_id: HARDWARE_ID, signing_fingerprint: PRODUCTION_FINGERPRINT,
    schedule_mode: schedule, evidence_record: 'LOCAL TEST ONLY: physical initialization verified',
  };
}

module.exports = { approval, capability };
