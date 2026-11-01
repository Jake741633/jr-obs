# Catalogue, Suppliers and AI Implementation Plan

> **For agentic workers:** Use independent bounded agents for catalogue and local-estimate changes while the owner implements supplier references and integrates the result.

**Goal:** Expand reusable electrical jobs and make supplier-linked estimating more useful on a phone.

**Architecture:** Preserve existing Material preferred supplier fields and append optional public supplierOptions metadata. Extend the existing material form/search/sharing and its durable write guards. Add scoped starter templates through the existing non-overwriting importer; share a scope parser/ranker across local material and labour estimates.

**Tech Stack:** Next.js, React, TypeScript, existing Node test harnesses and JSON record persistence.

**Spec:** `docs/superpowers/specs/2026-11-01-catalogue-suppliers-ai-design.md`

## Global Constraints

- Preserve original catalogue IDs, costs, saved customisations and existing quote snapshots.
- No fabricated stock codes, fetched account prices, automatic orders, new dependencies or database/access changes.
- No hosted AI activation, paid requests or expanded provider sharing.
- Keep material save retries, changed-record checks, account/session boundaries and price-free sharing.

## Review Focus

- New supplier references must survive a failed save and unrelated quick price/favourite updates.
- Preferred swaps and searches must preserve exact stock codes and never relabel a different price automatically.
- Sharing must validate the current exact material and omit private data for every option.
- Exclusions and questions must not inflate suggested work or labour; broad job type alone is not a match.
- Catalogue expansion must not overwrite existing saved packs or pretend template quantities establish circuit design.

### Task 1: Catalogue expansion

**Owner/files:** catalogue agent; `lib/starterData.ts` and focused catalogue tests.

- [x] Add failing invariants for 24 new distinct packs and valid generic material schedules.
- [x] Append new IDs and clearly labelled allowances without changing existing seeds.
- [x] Run catalogue/import/quote integration regressions and report exact counts.

### Task 2: Multiple wholesaler references

**Owner/files:** main agent; `lib/models.ts`, new `lib/materialSuppliers.ts`, `app/materials/page.tsx`, material sharing/integration tests.

**Interfaces:** Material.supplierOptions?: MaterialSupplierOption[]; normaliseMaterialSupplierOptions(options, preferred); materialSupplierReferences(material); promoteMaterialSupplier(preferred, options, id). Public references contain only supplier, stockCode and supplierUrl plus an identity.

- [x] Write meaningful failing helper and durable UI tests.
- [x] Implement bounded validation, preferred swaps and public reference projection.
- [x] Add phone-sized form rows, per-option sharing, and search/filter over all suppliers.
- [x] Verify legacy records, unsafe links, partial/failed saves and retained callback boundaries.

### Task 3: Scope-aware local estimating

**Owner/files:** AI agent; new `lib/estimateScope.ts`, `lib/aiCommandCentre.ts`, `lib/aiLearning.ts`, existing quote-builder review UI and focused tests.

**Interfaces:** analyseEstimateScope(notes, selectedJobType?); rankEstimatePacks({scope, jobPacks, limit?}) with explicit match reasons. Keep existing external estimate APIs and exact reviewed line values.

- [x] Reproduce unrelated pack/history, excluded work and alias failures.
- [x] Implement shared included-scope analysis and stable unique matching.
- [x] Separate detected scope, questions and exclusions in the existing review card.
- [x] Run matching, pricing, quantity, historical-cost and quote-save regressions.

### Task 4: Integration and preview

**Owner/files:** main agent; docs/JOB_CATALOGUE.md, docs/MOBILE_APP.md, ROADMAP.md and changed implementation.

- [ ] Review all parallel changes and run full tests, lint and production build.
- [ ] Complete independent review, resolve meaningful findings and record remaining device checks.
- [ ] Commit/upload a feature PR; require green CI before development-preview integration.
- [ ] Verify deployment and provide the existing JR OS preview link with exact usage steps and limits.

## Review resolution

Independent review found four Important issues; all were reproduced and fixed with regressions: negative conjunctions, neutral-name whole-fit-out selection, distinct Cat6/doorbell coverage, and malformed saved supplier metadata. A related pre-existing hourly/day rate mismatch was also reproduced and corrected for new drafts. The existing assistant briefing harness now loads the real scope helper. Prior learning-memory policies invalidate without a schema change.

Final local test run: 2,724 passed, zero failures. ESLint passed. Production build and preview integration are recorded by their command/CI results. Device paste/share and confirmed hosted sync remain acceptance checks.
