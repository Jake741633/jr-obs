# Electrical Catalogue Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for remaining implementation and superpowers:requesting-code-review before integration. This records the user-approved build already in progress; do not restart completed tasks.

**Goal:** Make reusable electrical estimating packs and product sharing usable in daily quoting.

**Architecture:** Extend existing JSON models with optional cost snapshots and internal notes. Reuse guarded catalogue imports and breakdown components in both entry points; isolate product sharing from pricing data. Preserve existing collection and session boundaries.

**Tech Stack:** Next.js, React, TypeScript, existing cloud/local collections, Node executable tests.

**Spec:** `docs/JOB_CATALOGUE.md`, approved by the user in chat.

## Global Constraints

- Development branch only; production `main`, PR #1 and database schemas remain unchanged.
- No secrets, paid AI requests, external messages, fabricated supplier codes or live-price claims.
- Existing IDs and edited records remain untouched by imports.
- Historical prices belong to internal notes, not customer quote scope.
- Phone acceptance remains outstanding until tested on the actual devices.

## Review Focus

- Interrupted storage/account changes must stop subsequent imports and allow safe retry.
- Duplicate material/pack identities must not select an arbitrary record.
- Missing costs must remain visibly incomplete; price changes must not reprice reviewed packs.
- Quote import/save round trips must preserve selling totals, cost snapshots and hours.
- Native clipboard/share failures must preserve privacy and provide usable fallback text.

### Task 1: Catalogue data and price model

**Files:** `lib/starterData.ts`, `lib/models.ts`, `lib/jobPackCatalogue.ts`; tests `starter-catalogue-data.test.mjs`, `job-pack-catalogue.test.mjs`.

**Interfaces:** `jobPackTotals(pack, materials)`, `packLineCost(line, materials)`, `catalogueImportPlan(materials, packs, sourceMaterials, sourcePacks, includePacks)`, `importCataloguePlan(plan, actions)` and `jobPackQuoteLines(pack, materials, nextId)`.

- [x] Add failing data/invariant tests for 40 packs, 101 materials, preserved IDs and linked BOMs.
- [x] Observe RED, then add guide data with historical references separate from customer notes.
- [x] Add failing total/import tests for missing costs, snapshots, duplicates, partial writes and changed accounts.
- [x] Implement helpers and verify the targeted tests pass.

### Task 2: Daily-use UI and sharing

**Files:** `components/catalogue/StarterCatalogue.tsx`, `components/jobs/JobPackBreakdown.tsx`, `components/materials/MaterialShareActions.tsx`, `lib/materialSharing.ts`, pages `job-packs`, `materials`, `starter-library`, `quotes`.

**Interfaces:** Catalogue consumes loaded collections and one identity state. Breakdown consumes a pack, materials and optional live sharing guard. Share actions consume four allowlisted product fields plus context and live guard.

- [x] Write and observe failing VM/component tests before adding guarded imports and durable pack edits.
- [x] Implement visible quantities, buying/selling/labour totals, private notes and explicit import approval.
- [x] Test and implement native paste fields, validated product URLs and click-only copy/share fallback.
- [x] Test and implement quote allowance preservation, fixed labour and cost/hour round-trip.
- [x] Replace legacy optimistic starter import entry point with the reusable guarded component.
- [x] Verify all new tests and existing regression tests, lint and build (2,471 tests, zero failures).

### Task 3: Review and development delivery

**Files:** `ROADMAP.md`, `docs/MOBILE_APP.md`, this plan and catalogue guide.

- [x] Independent read-only whole-feature review, fix important findings with regression tests. Same-owner draft recovery and imported numeric precision fixes re-reviewed with no remaining blockers.
- [x] Run `npm test`, `npm run lint`, `npm run build` and `git diff --check`; all exited zero.
- [ ] Commit, open a development PR, verify CI/preview deployment and merge only `jr-os-v2`.
- [ ] Read-only browser verification, confirm production unchanged, hand over the import steps and physical-phone limits.
