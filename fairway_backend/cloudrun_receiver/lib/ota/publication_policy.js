'use strict';

// Reviewed release evidence belongs in source control, never in an upload body.
const PUBLICATION_APPROVALS = Object.freeze({});
const RELEASE_BLOCKERS = Object.freeze([
  'Alignment-register recognition and complete remote-backed release evidence require review.',
  'Release-specific CPO publication authorization must be recorded.',
  'Accepted nightly images require a separately accepted scheduler correction.',
]);

function publicationEligible(releaseId, digest, approvals = PUBLICATION_APPROVALS) {
  const approval = approvals[releaseId];
  return releaseId !== 'OTA-0.1' && !!approval && approval.sha256 === digest
    && ['verification_record', 'cpo_approval_record', 'alignment_record',
      'source_commit', 'release_record_commit', 'remote_backup_record',
      'publication_authorization_record'].every((field) => (
      typeof approval[field] === 'string' && approval[field].trim().length > 0
    )) && /^[a-f0-9]{40}$/.test(approval.source_commit)
    && /^[a-f0-9]{40}$/.test(approval.release_record_commit)
    && Array.isArray(approval.device_ids) && approval.device_ids.length > 0
    && approval.device_ids.every((id) => /^FRB-\d{4}$/.test(id));
}

module.exports = { PUBLICATION_APPROVALS, RELEASE_BLOCKERS, publicationEligible };
