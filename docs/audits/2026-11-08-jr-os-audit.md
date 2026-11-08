# JR OS application audit — 8 November 2026

## Source and scope

Jake requested an application audit, implementation of verified fixes, sustained work and a prompt for continuing in a new chat. Audit source: `bc6a9e5ca065bfa37b7f4874ae238719fa2058b1` on inactive billing draft PR327. Its 3,052 tests, lint, production build, both CI upgrade rehearsals, dependency review and preview passed. A fresh dependency scan reports zero vulnerabilities.

Core fixes are isolated on `fix/jr-os-audit-20261108` from `jr-os-v2` at `f2f7d9dac1973cdabe664151023c260fd6d1952e`. The audited core files are identical at those two checkpoints. Billing-only work remains separate on `feat/subscription-foundation-20261101`; it must remain disabled and draft/unmerged. Do not change PR1, PR30 or PR122.

Four independent read-only reviews examined auth/sync, quote/invoice/purchase workflows, field/mobile attachments/time, and API/integration lifecycles. Findings below were reproduced using real modules/actions with synthetic storage and deferred/native-loopback network fixtures. They are not inferred from TODOs or missing commercial features.

## Verified findings

| ID | Priority | Finding | Status |
| --- | --- | --- | --- |
| A01 | High | Finishing an upload replaces the queue snapshot and erases files added or replaced while it awaited I/O. | Fixed and locally verified |
| A02 | High | Online collection reload replaces queued local edits/creates/deletes, allowing a later edit to permanently coalesce stale fields over the earlier change. | Fixed and locally verified |
| A03 | Medium | One failed private download prevents sibling previews; a late successful sibling can leak its blob after unmount. | Fixed and locally verified |
| A04 | Medium | Editing a normal quote's hourly quantity retains old labour hours and understates overhead cost. | Fixed and locally verified |
| A05 | High | Saving an open quote after its source refreshes silently overwrites newer prices/notes. | Fixed and locally verified |
| A06 | Medium | Purchase creation matches decorated quote descriptions against exact material names and loses material/supplier/code references. | Fixed and locally verified |
| A07 | Medium | Purchase numbering uses collection length, duplicating a live number after a middle deletion. | Fixed and locally verified |
| A08 | Medium | Generated purchase lines can combine a saved CEF code with another wholesaler's current URL. | Fixed and locally verified |
| A09 | Medium | A midnight start is treated as missing and counts valid `00:00–01:00` work as zero paid minutes. Raw times remain stored. | Fixed and locally verified |
| A10 | Medium | Supplier authentication ignores caller cancellation and lacks a deadline; lookup JSON is unbounded. | Fixed and locally verified |
| A11 | Medium | Billing status lacks a complete-response deadline, leaving its page loading with Refresh disabled after a stalled response. | Fixed separately in inactive PR327 at e540e9c |
| A12 | High | New normal quotes clear the draft through a React setter before the deferred storage/queue effect can fail. | Fixed and locally verified |
| A13 | Medium | Phase 1 CI only targets `main` pull requests, omitting the required pre-merge check on current `jr-os-v2` pull requests. | Fixed; exact-head workflow passed in PR328 |
| A14 | Medium | Shared collection/private-file HTTP reads can keep sockets and serialized upload attempts pending after page or session retirement. | Fixed and locally verified |
| A15 | Medium | Certificate preview requests a `noopener` handle, receives null and reports a blocked popup instead of writing its document. | Fixed and locally verified; browser/phone acceptance pending |
| A16 | High | A failed browser backup restore leaves restored customers mixed with old jobs/other collections. | Fixed and locally verified |
| A17 | High | Invalid backup collection shapes overwrite valid data, report success and then break the real collection consumer. | Fixed and locally verified within structural scope |

## Implementation and acceptance

Use a regression that fails on the reproduced behavior, then a minimal correction. Independent workers own adapter, quote/purchase, planner and supplier-route changes; the root owns private-file replay/downloads and integration. No worker stages, commits or publishes overlapping changes. Preserve exact tenant/session/role/collection boundaries, queued conflict bases, native transport cancellation and historical supplier references. New features, schema upgrades, dependencies, real provider calls and activation are outside these corrections.

Private-file replay must merge outcomes into the latest queue only for the unchanged attempted entry, preserve additions/replacements/deletions, suppress stale callbacks and serialize same-scope attempts. Mixed download results must retain successful previews and revoke discarded/retired object URLs. A cross-tab atomic storage redesign is not implied by a same-page coordination fix; any remaining concurrency boundary must be stated.

After integration: focused tests, full root suite, zero-warning lint, production build, a fresh read-only review and exact-tree CI/preview. Record source hashes and final delivery evidence in the pull request and continuation record. Green synthetic checks do not establish hosted security, production backup/restore or physical-phone acceptance.

## Existing deployment boundaries

The production database's latest baseline, actual protected backup, hosted migration marker and role/Storage acceptance require fresh evidence before any production schema upgrade. Existing security documents contain historical checks; they are not current production certification. Do not apply migrations or change cloud cutover, Auth policy, credentials, real data or account settings as a shortcut. Keep all subscription activation controls off. Fresh-provider reconciliation after review clearance, paid/AI enforcement, founder/trial/live/VAT/Connect and signed-in physical iPhone/Android acceptance remain separate launch work.

## Progress record

Audit checkpoint created before integration. Individual RED/GREEN results, final review findings, tests and publication evidence will be appended as the work completes. `JR_OS_CONTINUE.md` will provide the next chat with exact source/branch/check information and unfinished work.

The first complete integration run found three obsolete source-shape assertions and a test dependency fixture, all corrected narrowly; the runtime scope/privacy checks remain. A fresh review found three Important gaps: retired upload callbacks consuming work, the AI purchase consumer not handling newly rejected ambiguity, and new-quote deferred saving. Runtime regressions reproduced each; the fixes retain upload bytes until a current durable confirmation, report ambiguity before writes, and preserve creation drafts/identities on failed or uncertain saves. Retry numbering also rechecks the current collection without duplicating an already saved candidate.

Phase 1's branch filter now includes `jr-os-v2`, matching the active development target. GitHub's [workflow branch-filter documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpull_requestpull_request_targetbranchesbranches-ignore) confirms this filter selects the pull request target. Source inspection and PR327's workflow inventory established the omission; the corrected exact-head workflow must actually run before this is recorded as accepted. No synthetic unit test is used merely to mirror YAML text.

## First correction batch acceptance

All **2,927 core tests**, zero-warning ESLint and the production build pass. The core branch has no billing activation/schema changes and adds 74 regression cases to its 2,853-test base. The separate billing deadline fix passes all **3,059 tests**, lint and production build on that branch. Counts differ because the inactive billing foundation is deliberately separate from the core audit branch.

Private-file regressions observed ten failures before the queue/preview correction and two further failures for unmount/remount and failed durable confirmation. Adapter regressions observed eleven initial failures and three additional replay-completion failures. Quote/purchase regressions observed twelve initial failures, four review-pass failures and the retained-number collision before correction. Midnight regressions failed twice; supplier lifecycle tests failed at sixteen initial boundaries and three unread-response cleanup cases. Billing deadline regressions failed five times before correction. These are actual behavior tests, including native HTTP, not only source text assertions.

The fresh whole-branch reviewer reported no Critical findings and three Important findings; all three are fixed with RED→GREEN evidence. The final lint run also caught an aliased mutable quote-attempt object; immutable ref replacements corrected it without changing or disabling lint rules. Four old integration fixtures were updated to follow real dependencies/valid new source structure while preserving the scope checks.

Code is saved before remote jobs start. The pull request records the exact pushed commit/tree and the resulting CI, Phase 1, dependency-review and preview results. Source checks do not certify live/cloud cutover or deployment acceptance. Same-page upload coordination and conditional queue merges do not establish atomic cross-tab localStorage writes.

First batch publication: **PR328**, commit `3ce2db9afcbf4c34ab659b13046aa079b38d1b7a`, tree `7b8b7c39a2675512db94ab92ada0bfaa560c635c`. JR OS CI passed all three jobs, including both database upgrades; Phase 1 CI, Dependency Review and Netlify preview passed. The CI log independently confirms all 2,927 tests. The branch remains draft/unmerged. Separate PR327's A11 commit `e540e9c3230b32e31625a8872901b1c7073ccf96` also has green CI, Dependency Review and preview; its 3,059 tests/lint/build passed locally. Phase 1's corrected trigger belongs to the core branch and is not claimed present in PR327 yet.

## Second audit slice

A14 was reproduced with native fetch and synthetic loopback servers: continuously streaming JSON/blob responses remain pending after session/page retirement, and a later upload flush remains behind the outstanding transfer. A positive control using a native abort closes the socket. Stalled headers were also observed, without claiming that the runtime has no eventual default timeout. The correction must bound full consumption and propagate actual cancellation through authorization, metadata, object and download stages; a cancelled provider request remains an unknown write outcome and must preserve replay identity/bytes.

Use the existing exact token+epoch session-ownership rule. A token refresh can retire an old request and cause a retry; the fresh request/replay must remain usable. Do not introduce a new JWT-decoding continuity policy or reduce ownership to user ID. Intended full-body defaults are 30 seconds for ordinary cloud/Auth JSON, 120 seconds for private upload and 60 seconds for private download.

A15's API assumption was checked against [MDN's Window.open contract](https://developer.mozilla.org/en-US/docs/Web/API/Window/open#noopener): `noopener` returns null and `noreferrer` implies it. The actual page handler now retains a writable blank handle, detaches/verifies its opener before any certificate content and cleans a failed preview safely. Thirteen actual-handler contract tests use the real certificate HTML generator; eleven failed before the correction and all pass afterward, as does focused ESLint. The fixture follows documented browser semantics; the local Playwright package had no installed browser executable, so no native-browser or physical-phone pass is claimed.

A16/A17 were reproduced against the actual browser import function with synthetic files/storage. Quota on the second destination leaves new customers mixed with old jobs. Object/null/malformed-string/null-row collection payloads overwrite valid customers and return success before the repository/consumer fails or hides records. The correction must validate all allowed values before writing, preserve the separate organisation AI-profile shape, restore previous raw bytes in reverse after a failure, remove originally absent keys, and report incomplete rollback without overwriting a detected intervening change. Current identity and role/key exclusions remain authoritative. This is browser-cache restoration, not authorization for a production database backup/import.

## Second correction batch acceptance

All **2,994 core tests**, zero-warning ESLint and production build pass. The second batch adds 67 actual behavior cases: 26 native-loopback transport cases, 13 certificate-handler cases and 28 executed backup-import cases. One fresh whole-second-batch review independently passed 76 focused tests, reviewed the changed consumers, and reported no Critical, Important or Minor findings.

Transport tests failed at fifteen of seventeen initial native boundaries, then separately at token-retirement and silent-retirement HTTP-error boundaries before correction. They verify real socket closure through headers and JSON/text/blob bodies, caller/page/session cleanup, final ownership checks on success and error, preserved HTTP/network error categories, three upload authorization stages, metadata/object cancellation, retained replay bytes/identity and progress after an abandoned serialized upload. Explicit captured-credential logout remains deadline/caller-bound but can revoke the old credential while another account is current. Ordinary transports retain the exact token+epoch rule; no decoded-JWT or same-user continuity policy was added.

Timeouts apply per HTTP request, not to an entire multi-file queue. A dispatched ownership retirement cancels immediately; silent primitive storage changes are rechecked at completion/error or the deadline. An ordinary token rotation can require a new request or replay. Timeout/cancellation does not prove provider rollback and never discards unconfirmed queued bytes.

Backup tests observed eighteen initial failures before correction; all allowed sections now validate before writes, valid serialized legacy bytes remain intact, and failed writes recover exact earlier bytes in reverse where possible. Initially absent keys are removed. Detected intervening changes are preserved and incomplete recovery is explicitly reported. Generic record validation is structural rather than a complete domain-schema migration; known AI-profile fields are checked when present and id-less settings collections remain supported.

Certificate tests observed eleven initial failures before correction. The environment's optional headless-browser download was unavailable/truncated; only the documented API contract and actual handler/HTML tests are accepted here. Native browser/physical iPhone/Android printing remains pending.

This checkpoint is saved before its remote jobs start. The PR records the final exact commit/tree/checks. No dependency, schema, hosted account/configuration/credential, actual backup, provider payment or email change occurred. First-batch limitations and production acceptance boundaries remain in force.
