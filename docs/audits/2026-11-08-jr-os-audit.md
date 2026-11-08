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
| A13 | Medium | Phase 1 CI only targets `main` pull requests, omitting the required pre-merge check on current `jr-os-v2` pull requests. | Trigger corrected; remote verification pending |

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

Next audit slice: verify native HTTP lifecycles in shared cloud collection/private-file transports. This is being investigated read-only; it is not yet an accepted new finding or an implemented change in this checkpoint.
