# Continue the JR OS audit

Jake asked: audit JR OS, work through the findings, continue for the available chat capacity and provide a prompt for the next chat. Continue implementation; do not restart the completed audit or stop after a plan.

## Project and source

- Repository: `Jake741633/jr-obs`, the JR OS electrician business-management app. [Live JR OS sign-in](https://jr-os.netlify.app/cloud)
- Core audit branch: `fix/jr-os-audit-20261108`, created from `jr-os-v2` at `f2f7d9dac1973cdabe664151023c260fd6d1952e`. Find its current pull request and head through GitHub; copy returned IDs/SHAs exactly. Do not work on `main` or directly commit to `jr-os-v2`.
- Audit report: `docs/audits/2026-11-08-jr-os-audit.md`. The PR description records exact remote acceptance after this document is saved.
- Separate subscription foundation: draft PR327, branch `feat/subscription-foundation-20261101`. Its A11 status-deadline fix is at `e540e9c3230b32e31625a8872901b1c7073ccf96`, tree `f4bd056dd8658f2ed8a3fc4a86448a8f01a62587`. Re-fetch its current head before using that checkpoint. Billing remains disabled, its prepared migration unapplied, and the PR unmerged.
- Leave PR1, PR30 and PR122 alone.
- Combined reviewed checkpoint: PR327 head `ffad7537945565838d96ae264c1518c7a54fb452`, tree `38229630589a57a5b45622e00a9f06aa0c9099e5`, incorporates core `faf47719fcb97af22f9043a134487dfab9faef7f`. All 3,200 combined tests, lint/build, CI with both synthetic upgrades, Phase 1, dependency review and preview passed. Re-fetch later heads: a third core correction batch is in progress below.

## Completed and verified locally

A01–A10 and A12 core corrections cover private queue additions/replacements/concurrent flushes; durable attachment confirmation after remount; mixed preview failure and blob cleanup; latest exact-account queued edits/creates/deletes and replay-versus-read races; hourly overhead time; current-source quote edits and durable new-quote retries; unique purchase numbers; matching material/supplier/code/link snapshots; midnight labour; and supplier cancellation, one deadline and a 2,048-byte streaming input bound. AI ambiguity handling and quote retry number collisions are covered too.

First core checkpoint: **2,927 tests**, zero-warning lint and production build passed and PR328's CI/Phase1/dependency/preview checks passed at `3ce2db9afcbf4c34ab659b13046aa079b38d1b7a`. Billing A11 checkpoint: **3,059 tests**, lint/build, CI/dependency/preview passed at `e540e9c`. One first-batch fresh review found three Important gaps; all were fixed with RED→GREEN evidence.

Second core batch adds A14–A17: shared full-body native HTTP deadlines and cleanup; secure usable certificate preview; preflight browser backup validation and conditional reverse rollback. All **2,994 core tests**, zero-warning lint and production build pass, and a fresh second-batch review reported no findings after independently passing 76 focused tests. Native HTTP regressions use actual loopback sockets; certificate tests establish the documented window contract/actual handler, not a physical-device pass. Check the PR for the later exact source/remote acceptance and any integration into the still-inactive billing branch. Counts differ before integration because billing foundation tests live separately.

A13 updates `.github/workflows/phase1-ci.yml` to run for pull requests targeting `jr-os-v2` as well as `main`. The first core PR must prove that workflow actually runs. Missing/queued/failed checks are not green. Source after this checkpoint needs fresh full verification and exact-head CI.

Third audit slice A18–A23 covers durable invoice payment/status/timeline actions, recoverable quote/AI conversion, certificate revision durability/stale history, mobile testing evidence/status, expense/receipt actions and central durable-ID ambiguity rejection. Review also added Ready/Complete evidence validation and explicit new-certificate same-account reload recovery. All third-slice implementations and their review corrections are now locally verified; exact full-suite/build and publication acceptance are recorded in the final PR evidence. Expense queue previews and private-byte confirmation precede acknowledgement; quote conversions are recoverable sequences, not atomic transactions. Do not reimplement accepted findings. Review any newer working-tree changes before editing.

Final third-core local acceptance: **3,101/3,101 tests**, zero-warning lint and production build. Independent slice re-reviews report no remaining findings (certificate/testing/central IDs; invoice/conversion; expense preview/receipt confirmation). Find the later exact core and combined publication heads/checks in PR328/PR327. Re-fetch those heads; do not mistake the older 3,200-test combined checkpoint for the final integration.

## Resume

1. Re-fetch current branches/PR heads and inspect CI/Phase 1/dependency-review/Netlify checks. Read the current audit report and PR descriptions before repeating work. Preserve any newer edits; never force-reset a shared checkout.
2. A01–A28 are implemented on the branches identified in the audit. Check each PR description for its current verification and billing integration checkpoint. Next, fix A29 in Mobile QA. A synthetic storage failure reproduced lost draft notes, unsaved checklist progress and a failed result claiming a linked snag that could not be saved. Continue the remaining legacy save and attachment paths and signed-in phone workflows using synthetic accounts or fixtures. Certificate printing still needs a browser and iPhone/Android check.
3. Reproduce each actual defect with synthetic fixtures, write a regression that fails, make a minimal correction, then verify focused tests. Preserve tenant/session/role/collection boundaries, original conflict versions, durable retries and supplier identities.
4. Run `npm test`, `npm run lint`, `npm run build` and appropriate upgrade checks; obtain a fresh read-only review of each substantial new batch. Publish real commits and reviewable PR changes, then verify the exact remote head and preview. Keep a chronological evidence/remaining-work record and refresh this continuation record.
5. Continue useful audit/fix work until the chat's practical limit, then give Jake a paste-ready continuation prompt with current repository, branches, PRs, exact heads, verified checks and remaining tasks. Do not merely offer to continue.

## Retained boundaries

No production schema upgrade, backup export/import, Auth/cloud-mode change, credential mutation, real provider request/payment/refund/subscription/email or billing activation is authorized by the code audit. Do not re-run the previously rejected Supabase CLI/telemetry operation. Use local synthetic rehearsals for schema verification; actual protected production backup/restore, current hosted RLS/Storage and physical iPhone/Android acceptance still require independent evidence. Do not bypass those gates or describe them as complete. Cross-tab atomic storage, live provider/phone behavior, fresh reconciliation after review clearance and commercial paid/AI/founder/trial/VAT/Connect work remain separate unless later explicit authorization and evidence change the scope.

A14 retains exact token+epoch ownership. Deadlines are per request: JSON/Auth 30s, private upload 120s and download 60s. Token rotation can retire an old transport and require replay. Dispatched retirement cancels immediately; silently changed primitive storage is rechecked on completion/error or deadline. A cancelled/expired write remains uncertain and does not justify deleting queued bytes or inventing provider rollback. Browser import validates structure and known profile fields, not a full domain schema; rollback preserves detected concurrent changes and reports incomplete recovery.

## Fourth correction batch

PR328 continues the core audit with A24 and A25. The ordinary Add document flow retains the selected file until record and private queue persistence succeed and rejects callbacks retired by a job or workspace change. The private file bridge starts replay after explicit byte confirmation, including after a retry with existing metadata. The previous billing checkpoint is recorded in PR327. Use the current PR head and its matching checks before relying on new changes.

## Sign-in continuation

A26 recovers the account page after a transient lookup failure when the same session's workspace identity verifies. The linked Supabase project was separately resumed after it paused. The live sign-in address above is the production entry point. PR328's Netlify status identifies the draft preview, and its description records the current checks.

## Field diary continuation

A27 covers both field diary forms. They preserve the draft if device storage or queueing fails. If the diary is saved and the note fails, keep the page open to retry the original note from the saved diary. Check PR328 for the exact commit, build, test and preview results.

## Mobile snag continuation

A28 covers mobile snag creation and status changes. Snag drafts and status displays now depend on the task write succeeding. The open page keeps a failed timeline note for retry, and the existing cloud sync notices follow each task and note separately. Review PR328 for the exact commit, CI and preview results. Mobile QA is the next reproduced issue.
