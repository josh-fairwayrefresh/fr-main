'use strict';

// Reviewed release evidence belongs in source control, never in an upload body.
const PUBLICATION_APPROVALS = Object.freeze({
  'OTA-0.1alt-r2': Object.freeze({
    sha256: '2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844',
    verification_record: 'docs/FIRMWARE_SPECIFICATION.md#corrected-successor-qualification--2026-11-09; signed-image and production trust-anchor verification',
    cpo_approval_record: 'docs/DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10; exact-hash acceptance',
    alignment_record: 'docs/DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10',
    source_commit: '685cf648fed4e366be37cb8f9861490ec9a31e39',
    release_record_commit: 'f06cde9e441a3824a9acc6c63cffacf6f2dee5db',
    remote_backup_record: 'https://github.com/josh-fairwayrefresh/fr-main/commit/f06cde9e441a3824a9acc6c63cffacf6f2dee5db (review/frb0005-increment-1.0-source-checkpoint-20261105)',
    publication_authorization_record: 'docs/DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10; publication authorized for FRB-0005 only',
    device_ids: Object.freeze(['FRB-0005']),
    build_base_commit: '11213b4ad0607486df12f28d764f6d6abd90cdb6',
    build_source_sha256: '47bbaa7c2543469f336e81d91121c49d1334400cc5ac426b20ff8cd44e414dc3',
  }),
  'OTA-1.0-r2': Object.freeze({
    sha256: '21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c',
    verification_record: 'docs/FIRMWARE_SPECIFICATION.md#corrected-successor-qualification--2026-11-09; signed-image and production trust-anchor verification',
    cpo_approval_record: 'docs/DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10; exact-hash acceptance',
    alignment_record: 'docs/DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10',
    source_commit: '685cf648fed4e366be37cb8f9861490ec9a31e39',
    release_record_commit: 'f06cde9e441a3824a9acc6c63cffacf6f2dee5db',
    remote_backup_record: 'https://github.com/josh-fairwayrefresh/fr-main/commit/f06cde9e441a3824a9acc6c63cffacf6f2dee5db (review/frb0005-increment-1.0-source-checkpoint-20261105)',
    publication_authorization_record: 'docs/DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10; publication authorized for FRB-0005 only',
    device_ids: Object.freeze(['FRB-0005']),
    build_base_commit: '11213b4ad0607486df12f28d764f6d6abd90cdb6',
    build_source_sha256: '47bbaa7c2543469f336e81d91121c49d1334400cc5ac426b20ff8cd44e414dc3',
  }),
});
const RELEASE_BLOCKERS = Object.freeze([
  'Alignment-register recognition and complete remote-backed release evidence require review.',
  'Release-specific CPO publication authorization must be recorded.',
  'Accepted nightly images require a separately accepted scheduler correction.',
]);

function publicationEligible(releaseId, digest, approvals = PUBLICATION_APPROVALS) {
  const approval = approvals[releaseId];
  return releaseId !== 'OTA-0.1' && !!approval && approval.sha256 === digest
    && (!releaseId.endsWith('-r2') || (
      /^[a-f0-9]{40}$/.test(approval.build_base_commit || '')
      && /^[a-f0-9]{64}$/.test(approval.build_source_sha256 || '')
    ))
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
