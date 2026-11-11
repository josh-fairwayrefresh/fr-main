'use strict';

// Reviewed release evidence belongs in source control, never in an upload body.
const PUBLICATION_APPROVALS = Object.freeze({
  'OTA-1.0-r4': Object.freeze({
    sha256: 'cd1ecbdf6072a5ad72b2ed1e86d6fe207c12717d5f057c6f8f1437b29db9e26e',
    verification_record: 'docs/DEPLOYMENT_GUIDE.md#ota-10-r4-correction--cpo-acceptance-and-publication-authorization-2026-11-10; independently verified original manifest docs/releases/OTA-1.0-r4-manifest.json',
    cpo_approval_record: 'docs/DEPLOYMENT_GUIDE.md#ota-10-r4-correction--cpo-acceptance-and-publication-authorization-2026-11-10; exact-hash acceptance',
    alignment_record: 'docs/DEPLOYMENT_GUIDE.md#ota-10-r4-correction--cpo-acceptance-and-publication-authorization-2026-11-10',
    source_commit: 'cc79c0213ebe736abb6b31cd4f98b8a273f7fedd',
    release_record_commit: 'cc79c0213ebe736abb6b31cd4f98b8a273f7fedd',
    remote_backup_record: 'https://github.com/josh-fairwayrefresh/fr-main/commit/cc79c0213ebe736abb6b31cd4f98b8a273f7fedd (review/frb0005-increment-1.0-source-checkpoint-20261105)',
    publication_authorization_record: 'docs/DEPLOYMENT_GUIDE.md#ota-10-r4-correction--cpo-acceptance-and-publication-authorization-2026-11-10; publication authorized for FRB-0005 only',
    device_ids: Object.freeze(['FRB-0005']),
    build_base_commit: 'cfc98efde2db49e6190c769064c5e587c2076a10',
    build_source_sha256: '831cf3b9a2eadc52e6b6c425e2c3bf8377a0f7fb63a3644e1535c5f998eb69c9',
  }),
  'OTA-0.1alt-r4': Object.freeze({
    sha256: 'e05e67f4b5b060658badd1881fd0189be1b53f3019df67ee29c0a221a45849f2',
    verification_record: 'docs/DEPLOYMENT_GUIDE.md#r4-discovery-parsing-correction--cpo-acceptance-and-publication-authorization-2026-11-10; independently verified original manifest docs/releases/OTA-0.1alt-r4-manifest.json',
    cpo_approval_record: 'docs/DEPLOYMENT_GUIDE.md#r4-discovery-parsing-correction--cpo-acceptance-and-publication-authorization-2026-11-10; exact-hash acceptance',
    alignment_record: 'docs/DEPLOYMENT_GUIDE.md#r4-discovery-parsing-correction--cpo-acceptance-and-publication-authorization-2026-11-10',
    source_commit: 'bd1bc7bd3c103a4e8b1ba4f60edc26a10c683c87',
    release_record_commit: 'bd1bc7bd3c103a4e8b1ba4f60edc26a10c683c87',
    remote_backup_record: 'https://github.com/josh-fairwayrefresh/fr-main/commit/bd1bc7bd3c103a4e8b1ba4f60edc26a10c683c87 (review/frb0005-increment-1.0-source-checkpoint-20261105)',
    publication_authorization_record: 'docs/DEPLOYMENT_GUIDE.md#r4-discovery-parsing-correction--cpo-acceptance-and-publication-authorization-2026-11-10; publication authorized for FRB-0005 only',
    device_ids: Object.freeze(['FRB-0005']),
    build_base_commit: 'a6350d738088557463909886c411775149fd5984',
    build_source_sha256: '831cf3b9a2eadc52e6b6c425e2c3bf8377a0f7fb63a3644e1535c5f998eb69c9',
  }),
  'OTA-0.1alt-r3': Object.freeze({
    sha256: '79e53b5643fcc78cabb152e89eeac4fc1377587dd58b71c51d41c0cb7637275d',
    verification_record: 'docs/DEPLOYMENT_GUIDE.md#final-revised-firmware-packages--built-and-verified-not-acceptedpublished; independently verified original manifest docs/releases/OTA-0.1alt-r3-manifest.json',
    cpo_approval_record: 'docs/DEPLOYMENT_GUIDE.md#running-confirmation-successors--cpo-acceptance-and-publication-authorization-2026-11-10; exact-hash acceptance',
    alignment_record: 'docs/DEPLOYMENT_GUIDE.md#running-confirmation-successors--cpo-acceptance-and-publication-authorization-2026-11-10',
    source_commit: '00530a1a5875c3217e1de7e0368cd8b323fe1173',
    release_record_commit: 'fd631ecf9d9479ada8f11c937e072093b80797a5',
    remote_backup_record: 'https://github.com/josh-fairwayrefresh/fr-main/commit/fd631ecf9d9479ada8f11c937e072093b80797a5 (review/frb0005-increment-1.0-source-checkpoint-20261105)',
    publication_authorization_record: 'docs/DEPLOYMENT_GUIDE.md#running-confirmation-successors--cpo-acceptance-and-publication-authorization-2026-11-10; publication authorized for FRB-0005 only',
    device_ids: Object.freeze(['FRB-0005']),
    build_base_commit: 'a99c45cf97de478c5c199381e48e6061d9de5fcd',
    build_source_sha256: '7db7dfa0a8f8070eb93253cecddc82bce09b66d5585f165ef3041afca52b7051',
  }),
  'OTA-1.0-r3': Object.freeze({
    sha256: '2869c2f47cb1b6a35665235e6b24bacd401aaafe8dfa59f632514d0cf0ebd41d',
    verification_record: 'docs/DEPLOYMENT_GUIDE.md#final-revised-firmware-packages--built-and-verified-not-acceptedpublished; independently verified original manifest docs/releases/OTA-1.0-r3-manifest.json',
    cpo_approval_record: 'docs/DEPLOYMENT_GUIDE.md#running-confirmation-successors--cpo-acceptance-and-publication-authorization-2026-11-10; exact-hash acceptance',
    alignment_record: 'docs/DEPLOYMENT_GUIDE.md#running-confirmation-successors--cpo-acceptance-and-publication-authorization-2026-11-10',
    source_commit: '00530a1a5875c3217e1de7e0368cd8b323fe1173',
    release_record_commit: 'fd631ecf9d9479ada8f11c937e072093b80797a5',
    remote_backup_record: 'https://github.com/josh-fairwayrefresh/fr-main/commit/fd631ecf9d9479ada8f11c937e072093b80797a5 (review/frb0005-increment-1.0-source-checkpoint-20261105)',
    publication_authorization_record: 'docs/DEPLOYMENT_GUIDE.md#running-confirmation-successors--cpo-acceptance-and-publication-authorization-2026-11-10; publication authorized for FRB-0005 only',
    device_ids: Object.freeze(['FRB-0005']),
    build_base_commit: '00530a1a5875c3217e1de7e0368cd8b323fe1173',
    build_source_sha256: '7db7dfa0a8f8070eb93253cecddc82bce09b66d5585f165ef3041afca52b7051',
  }),
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
const RELEASE_REPLACEMENTS = Object.freeze({
  'OTA-0.1alt-r2': 'OTA-0.1alt-r3',
  'OTA-1.0-r2': 'OTA-1.0-r3',
  'OTA-0.1alt-r3': 'OTA-0.1alt-r4',
  'OTA-1.0-r3': 'OTA-1.0-r4',
});

function publicationEligible(releaseId, digest, approvals = PUBLICATION_APPROVALS) {
  const approval = approvals[releaseId];
  return !['OTA-0.1', 'OTA-0.1-r3', 'OTA-0.1-r4'].includes(releaseId) && !!approval && approval.sha256 === digest
    && (!/-r[234]$/.test(releaseId) || (
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

module.exports = { PUBLICATION_APPROVALS, RELEASE_BLOCKERS, RELEASE_REPLACEMENTS, publicationEligible };
