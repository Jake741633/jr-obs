# Quote Draft Additions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation, followed by one fresh whole-branch review. The user authorises continued work and green-CI development-preview integration without another permission gate.

**Goal:** Add saved/blank labour and reviewed whole job packs without leaving the phone quote draft.

**Architecture:** A pure additions helper constructs lines and public scope using the existing pack importer. The page previews selected pack content, appends atomically through the existing guarded editor, and retains all validation/save contracts.

**Tech Stack:** Existing React/TypeScript and Node real-page harness; no dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-quote-draft-additions-design.md

## Global Constraints

- Exact saved labour cost/charge and pack quantities/prices remain unrounded; existing pack fixed-labour total behavior remains authoritative.
- Unknown costs/prices/hours never become zero; non-hour labour requires explicit positive hours.
- No partial pack additions, silent merges or source mutations; internal pricing notes never become customer copy.
- Preserve all source/selection/account/readiness/save guards, full-draft totals and held review filter behavior; controls at least 48px.
- No dependencies, schema, provider requests, credentials, paid calls or production release.

## Review Focus

- Old add callbacks after selected rate/pack changes, source refresh/removal, readiness loss or session ownership changes.
- Half-day/call-out/minimum/day billing retains exact per-unit rates and cannot invent time or a free buying allowance.
- Missing or duplicated linked material records, empty packs, malformed amounts/lines and legacy Other notes do not cause partial additions or lose existing edits.
- Pack public notes/testing/exclusions survive save while internal notes do not leak into customer fields.
- Held review filters and rapid repeated adds retain all old/new lines and reject identity collisions without writes.

### Task 1: Pure addition contracts

**Files:** Create lib/quoteDraftAdditions.ts and tests/quote-draft-additions.test.mjs.
**Interfaces:** labourQuoteDraftAddition(rate: LabourRate|null, id: string) and jobPackQuoteDraftAddition(pack: JobPack, materials: Material[], nextId: () => string) return QuoteDraftAddition { lines, costBasisByLineId, customerNotes?, scopeItem? }. Validate new/source identities and named active supported rate; validate pack shape/line identities before delegating to jobPackQuoteLines.

- [x] Write and observe RED tests: exact labour prices/Hour mapping, all other units/missing hours, blank/invalid/inactive rates; preserved pack prices and Other charges/public scope, unknown/duplicate linked costs, empty/malformed/legacy packs and generated identity collisions; source immutability/private metadata.
- [x] Implement only those contracts; GREEN node --test tests/quote-draft-additions.test.mjs tests/quote-draft-lines.test.mjs.
- [x] Commit the helper and tests with their spec/plan.

### Task 2: Guarded phone editor

**Files:** Modify app/ai/quote-builder/page.tsx and tests/ai-estimate-review-ui.test.mjs.
**Interfaces:** Consume Task 1 additions. Append through current updateItems/estimateSave guards, combine cost-basis maps and public notes/scope, hold added identities in the current review list. Guard selections against latest committed values.

- [x] RED real-page cases for saved/blank labour, day time review, pack preview/add/save/public notes, unchanged original lines and full filtered save.
- [x] RED stale source/selection/account/readiness/unmount callbacks and synchronous repeat cases; duplicate identities, malformed packs and rejected additions leave draft unchanged.
- [x] Implement 48px labour/pack disclosures and review-first preview; preserve existing material behavior.
- [x] GREEN node --test tests/ai-estimate-review-ui.test.mjs tests/quote-draft-additions.test.mjs tests/quote-draft-lines.test.mjs tests/catalogue-quote-integration.test.mjs (86 passed).
- [x] Commit page/tests and update documentation.

### Task 3: Review and delivery

**Files:** Update docs/MOBILE_APP.md, ROADMAP.md, this plan.

- [x] Full npm test, npm run lint, npm run build; inspect exit codes and output.
- [x] One fresh whole-branch review, regrade by user impact; reproduce/fix Important/Critical findings RED→GREEN in one pass, then rerun full verification. No re-review.
- [ ] Publish exact tested tree via GitHub PR, verify CI/Netlify, merge jr-os-v2, confirm merged tree/shared preview and report actual acceptance limits.

## Progress

- Base b784da339fbcb85f94fa95651a761344c9641b46; clean isolated clone with feature branch feat/quote-draft-additions-20261101.
- Pre-flight: Task 1 produces the addition object consumed by Task 2. Existing quoteDraftLines review and jobPackQuoteLines expansion are reused; no conflicting interfaces. Baseline verification is running before source changes.
- Baseline: 2,791 tests passed. Task 1: 9 new tests observed RED, then 18/18 addition and existing-line tests passed.
- Task 2: 11 real-page cases observed RED, then GREEN. A retained-object collection refresh also reproduced a stale pack preview (RED) and now invalidates it (GREEN). Existing-line identity collision coverage confirms an add cannot replace the draft. All 86 targeted checks passed; full verification and independent review follow.
- Independent review found one blank-labour label defect. Root treated its duplicate/wrong removal action label as Important for phone screen-reader navigation, corrected category-specific labels, and verified the exact removal behavior RED→GREEN. No declined behaviors or deferred findings. Final full suite: 2,814 passed; final ESLint and production TypeScript/build passed. No re-review was performed. Hosted CI and development delivery remain the last step.
