# Pilot cleanup: already-executed historical evidence

This directory supports independent review of the CPO-authorized production
cleanup executed on October 20, 2026. It is not a product SoT, runbook, or
reusable production tool. The scripts retain production-capable logic for
review fidelity: **do not invoke production modes or rerun the cleanup**.
The publication itself does not authorize any production operation.

## Execution provenance and result

- Accepted source baseline: `3c70befb5b97a8f987f6b08a72804079b7b0da48`.
- Target: project `savvy-kit-496703-r5`, Firestore database `(default)`.
- Predicate: valid `received_at` strictly before
  `2026-10-17T16:39:35.270Z`, explicitly excluding protected request
  `bUgIybnJz0Xv7YMdz2Pm`. No tenant, status, or historical service-state
  filter. The cutoff is October 17 at 9:39:35.270 a.m. PDT in the configured
  `America/Los_Angeles` timezone.
- Preflight snapshot: `2026-10-20T20:59:41.016Z`: 544 requests,
  498 candidates (312 modern-tenant plus 186 legacy), 46 retained.
- Actual commits: 498 request-specific atomic transactions, recorded between
  `2026-10-20T21:03:22.245Z` and `2026-10-20T21:05:22.725Z`.

| Record type | Deleted | Retained at final verification |
|---|---:|---:|
| Requests | 498 | 46 |
| COMPLETE commands | 307 | 35 |
| Dispatch subscription descendants | 728 | 230 |
| Existing dispatch parent documents | 0 | 0 |

All candidate dependencies belonged to the modern-tenant subset; the 186
legacy candidates had none. Descendants were enumerated independently of
missing dispatch parents. Each transaction freshly read its request,
approved dependencies, and deterministic command path; deletes used
`updateTime` preconditions. Path/version/progress metadata supported
interruption reconciliation without content archival.

Seven old open requests had expired demand windows. Candidate notification
records had no pending/sending work or unexpired leases. Before writes,
candidate events were outside the verified 86,400-second queue-retention
horizon plus acknowledgement/runtime allowance; queue metrics were zero,
and the latest observed notifier invocation had completed with HTTP 200.
The actual deployed notifier source was inspected: it skips missing
requests but reads the request before acquiring dispatch state. Safety
therefore relied on the recorded delivery-horizon/drain checks, not an
assumed atomic parent check. No infrastructure was disabled or changed.

The repeated final snapshot at `2026-10-20T21:07:43.256Z` found zero
candidates or matching dependencies remaining, all 311 retained
request/dependency versions unchanged, and all 509 inventoried protected
operational versions unchanged. The cutoff request remained intact.
No failures or partial request units remained at completion.

## Evidence and validation limits

- [cleanup.cjs](cleanup.cjs): one-time executed procedure, sanitized as below.
- [reporting-check.cjs](reporting-check.cjs): one-time reporting check.
- [synthetic-test-output.txt](synthetic-test-output.txt): existing successful
  output from the final synthetic guard tests before deletion (recorded
  command session 893). Tests cover strict nanosecond boundaries, protected
  ID/ties/later timestamps, legacy inclusion, dependency classification,
  allowlists, version conflicts, simulated atomicity and interrupted absence
  reconciliation. This is not emulator or concurrency stress-test evidence.
- [final-verification-output.txt](final-verification-output.txt): existing
  final verification output (recorded command session 900), not recreated by
  another production run.

The reporting check returned HTTP 200 at snapshot
`2026-10-20T21:07:12.089Z`, with 46 history rows, the cutoff included, and
daily/weekly/monthly summaries present. It invoked the accepted handler
with real read-only production data through a REST adapter; token
verification was locally stubbed while actual access/course authorization
was exercised. This is not deployed authenticated-browser acceptance or
proof that every historical reporting semantic is correct.

Protected-version checks cover inventoried Firestore documents, not an
independent audit of every external system. No deployment, device operation,
IAM/credential change, service suspension, or notification retraction was
performed. Post-cutoff records were not excluded for incomplete operator
on/off evidence.

## Sanitization and SHA-256 provenance

External originals and execution evidence remain local pending review.
Excluded from publication: manifest, progress journal, bulk candidate IDs,
production snapshots, credentials, and request payloads/contents. The
protected cutoff ID and fixed project/resource identifiers are retained
because they define and explain the authorized boundary.

Script changes are limited to historical-warning comments and replacing
personal absolute checkout/dependency paths with repository-relative
resolution. No selection, transaction, retry, safety-check, reporting, or
authorization logic was changed. The scripts' original fixed-baseline
guards and one-time counts remain; they are intentionally not generalized.
Output files are exact copies of the selected recorded tool-result
`content` strings with one terminating LF added. Shell-session completion
markers and repository-relative incidental-file names are retained.
No missing output was invented, and no production operation was rerun for
publication.

| File | Executed original / recorded content SHA-256 | Published copy SHA-256 |
|---|---|---|
| `cleanup.cjs` | `8b018a40b4cd3075a6ca35251d772c5d8277dbf327528a7a96e4e6921c3bca3c` | `a40ee26c31bed12fa8562c126cf76777f97295e3127f6ad50056e3b4f973eeab` |
| `reporting-check.cjs` | `d65faeb285f0a2ad564e40406fb9bfba2d01daa45e750e9c954de9629182fde2` | `e7134cad8f0f10169aeeae2d50346c279e54dac2caba3bd4d3f86b98f43dc51d` |
| `synthetic-test-output.txt` | `911a6924fa95f75c0e44757ed57ef882ae6ba2bd7906491fbc535c28ea29f0cc` | `8a64fc645f1ac37a101dfa64b9a7dee5d080070a28721396ef4d2e559eac2f73` |
| `final-verification-output.txt` | `db211322625772156f13553a8f1536c03462c15192d5e554bdcdb967375e0f21` | `baefcbfcb18681512a970cb51ab32eac149fba3a76f8d65b3f74de9c9195d155` |

Publication validation is limited to complete diff/content review, provenance
and hash checks, syntax checks, and the cleanup script's local `self-test`
mode. Neither reporting nor cleanup production modes are run for this PR.
Lead Architect review, CPO acceptance of the evidence/guidance, and merge
authorization remain outstanding in the existing backlog.
