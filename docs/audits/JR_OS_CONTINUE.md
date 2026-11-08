# Continue the JR OS audit

Jake asked: audit JR OS, work through the findings, continue for the available chat capacity and provide a prompt for the next chat. Continue implementation; do not restart the completed audit or stop after a plan.

## Project and source

- Repository: `Jake741633/jr-obs` (JR OS electrician business-management app). This is separate from Jake's trades-lead app and marketing website.
- Core audit branch: `fix/jr-os-audit-20261108`, created from `jr-os-v2` at `f2f7d9dac1973cdabe664151023c260fd6d1952e`. Find its current pull request and head through GitHub; copy returned IDs/SHAs exactly. Do not work on `main` or directly commit to `jr-os-v2`.
- Audit report: `docs/audits/2026-11-08-jr-os-audit.md`. The PR description records exact remote acceptance after this document is saved.
- Separate subscription foundation: draft PR327, branch `feat/subscription-foundation-20261101`. Its A11 status-deadline fix is at `e540e9c3230b32e31625a8872901b1c7073ccf96`, tree `f4bd056dd8658f2ed8a3fc4a86448a8f01a62587`. Re-fetch its current head before using that checkpoint. Billing remains disabled, its prepared migration unapplied, and the PR unmerged.
- Leave PR1, PR30 and PR122 alone.

## Completed and verified locally

A01–A10 and A12 core corrections cover private queue additions/replacements/concurrent flushes; durable attachment confirmation after remount; mixed preview failure and blob cleanup; latest exact-account queued edits/creates/deletes and replay-versus-read races; hourly overhead time; current-source quote edits and durable new-quote retries; unique purchase numbers; matching material/supplier/code/link snapshots; midnight labour; and supplier cancellation, one deadline and a 2,048-byte streaming input bound. AI ambiguity handling and quote retry number collisions are covered too.

First core checkpoint: **2,927 tests**, zero-warning lint and production build passed and PR328's CI/Phase1/dependency/preview checks passed at `3ce2db9afcbf4c34ab659b13046aa079b38d1b7a`. Billing A11 checkpoint: **3,059 tests**, lint/build, CI/dependency/preview passed at `e540e9c`. One first-batch fresh review found three Important gaps; all were fixed with RED→GREEN evidence.

Second core batch adds A14–A17: shared full-body native HTTP deadlines and cleanup; secure usable certificate preview; preflight browser backup validation and conditional reverse rollback. All **2,994 core tests**, zero-warning lint and production build pass, and a fresh second-batch review reported no findings after independently passing 76 focused tests. Native HTTP regressions use actual loopback sockets; certificate tests establish the documented window contract/actual handler, not a physical-device pass. Check the PR for the later exact source/remote acceptance and any integration into the still-inactive billing branch. Counts differ before integration because billing foundation tests live separately.

A13 updates `.github/workflows/phase1-ci.yml` to run for pull requests targeting `jr-os-v2` as well as `main`. The first core PR must prove that workflow actually runs. Missing/queued/failed checks are not green. Source after this checkpoint needs fresh full verification and exact-head CI.

## Resume

1. Re-fetch current branches/PR heads and inspect CI/Phase 1/dependency-review/Netlify checks. Read the current audit report and PR descriptions before repeating work. Preserve any newer edits; never force-reset a shared checkout.
2. A01–A17 are implemented in the recorded branches; do not repeat them. Check the later integration checkpoint in PR descriptions. Continue with actual runtime/phone and remaining workflow audit, using synthetic test accounts/fixtures in an appropriate environment. Certificate printing needs a real browser and iPhone/Android check; the local optional browser binary was unavailable. Verify what can be established safely before asking for any missing account/environment decision.
3. Reproduce each actual defect with synthetic fixtures, write a regression that fails, make a minimal correction, then verify focused tests. Preserve tenant/session/role/collection boundaries, original conflict versions, durable retries and supplier identities.
4. Run `npm test`, `npm run lint`, `npm run build` and appropriate upgrade checks; obtain a fresh read-only review of each substantial new batch. Publish real commits and reviewable PR changes, then verify the exact remote head and preview. Keep a chronological evidence/remaining-work record and refresh this continuation record.
5. Continue useful audit/fix work until the chat's practical limit, then give Jake a paste-ready continuation prompt with current repository, branches, PRs, exact heads, verified checks and remaining tasks. Do not merely offer to continue.

## Retained boundaries

No production schema upgrade, backup export/import, Auth/cloud-mode change, credential mutation, real provider request/payment/refund/subscription/email or billing activation is authorized by the code audit. Do not re-run the previously rejected Supabase CLI/telemetry operation. Use local synthetic rehearsals for schema verification; actual protected production backup/restore, current hosted RLS/Storage and physical iPhone/Android acceptance still require independent evidence. Do not bypass those gates or describe them as complete. Cross-tab atomic storage, live provider/phone behavior, fresh reconciliation after review clearance and commercial paid/AI/founder/trial/VAT/Connect work remain separate unless later explicit authorization and evidence change the scope.

A14 retains exact token+epoch ownership. Deadlines are per request: JSON/Auth 30s, private upload 120s and download 60s. Token rotation can retire an old transport and require replay. Dispatched retirement cancels immediately; silently changed primitive storage is rechecked on completion/error or deadline. A cancelled/expired write remains uncertain and does not justify deleting queued bytes or inventing provider rollback. Browser import validates structure and known profile fields, not a full domain schema; rollback preserves detected concurrent changes and reports incomplete recovery.
