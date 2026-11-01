# Quote Catalogue Search Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation and one fresh whole-branch review. Continuing user authorisation includes green-CI integration into the development preview without another permission gate.

**Goal:** Find materials/packs quickly and explicitly choose a saved wholesaler for a quote line without leaving the draft.

**Architecture:** A pure catalogue helper filters globally unique public records and selects sanitized product metadata. The current editor consumes it, holds separate committed picker contexts and keeps search outside the financial/AI source context.

**Tech Stack:** Existing React/TypeScript and Node real-page harness; no dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-quote-catalogue-search-design.md

## Global Constraints

- Case-insensitive all-word local search uses public fields, keeps leading zeroes and never fetches links or searches private notes/prices/record ids.
- Unique saved identities are established before filtering; invalid/ambiguous reference rows are unavailable.
- Search resets picker choices, never current quote lines/notes/totals/review state. New priced draft clears searches.
- An alternate supplier changes only new-line supplier/code. Exact saved prices, material identity, unit and original preferred source remain unchanged; links remain preview metadata under the existing line model.
- Picker/session/source guards and 48px controls remain; no dependencies, schemas, credentials, provider requests, paid calls, automatic writes or production release.

## Review Focus

- Duplicate material identities where only one row matches the current search; ambiguous or removed additional supplier ids.
- Pasted URLs with credentials, script schemes or different query identifiers; zero-prefixed alphanumeric codes and whitespace/case differences.
- Retained add callbacks after material/reference/search or pack/search selection changes away and back, plus source/readiness/session/unmount changes.
- Switching to a second wholesaler changes new-line references but does not reprice, mutate the library, copy private fields or create extra writes.
- Search/clear/empty results while a completed or incomplete draft and held review filter already contain edited lines and public notes.

### Task 1: Public catalogue selection contracts

**Files:** Create lib/quoteDraftCatalogue.ts, tests/quote-draft-catalogue.test.mjs.
**Interfaces:** quoteDraftMaterialChoices(materials: readonly Material[], query: string): Material[]; quoteDraftPackChoices(packs: readonly JobPack[], query: string): JobPack[]; quoteDraftMaterialProduct(material: Material, referenceId: string): ShareableMaterial. Default referenceId is the literal preferred; only extra valid references can override it.

- [x] RED tests for multiword secondary supplier/code/link search, leading zeroes, private-field exclusion, global duplicates, malformed metadata, pack public work search and exact immutable supplier selection including no preferred source, invalid/ambiguous reference rejection and unsafe URLs.
- [x] Implement using savedIdentityIndex, materialSupplierReferences and materialShareDetails; GREEN node --test tests/quote-draft-catalogue.test.mjs tests/quote-draft-lines.test.mjs.
- [x] Commit helper/tests with spec/plan.

### Task 2: Phone picker integration

**Files:** Modify app/ai/quote-builder/page.tsx and tests/ai-estimate-review-ui.test.mjs; update docs/MOBILE_APP.md and ROADMAP.md.
**Interfaces:** Consume Task 1 choices/product. Capture independent material and pack picker context objects and validate against latest committed refs before adds. Use materialQuoteDraftLine with explicitly overlaid public product fields and unchanged financial source.

- [x] RED real-page cases: filtered material/pack options, match/empty feedback and Clear; selected material preview and alternate quote reference; exact saved line prices/private-field exclusion/source immutability; held full-draft save through searches; stale callbacks including away/back and lost source/ownership; no-reference material default; fresh generation resets search.
- [x] Implement guarded searches, 48px Clear actions, counts, material preview/read-only product fields and quote-only wholesaler selector; preserve existing additions and related media callbacks.
- [x] GREEN node --test tests/ai-estimate-review-ui.test.mjs tests/quote-draft-catalogue.test.mjs tests/quote-draft-additions.test.mjs tests/quote-draft-lines.test.mjs (97 passed).
- [x] Commit UI/tests/docs.

### Task 3: Verification and delivery

- [x] Full npm test, npm run lint, npm run build; inspect all exits/output.
- [x] One fresh read-only whole-branch review. Regrade by user impact; one RED→GREEN fix pass for Important/Critical findings and full verification; no re-review.
- [ ] Publish exact tested tree via PR, verify hosted CI/Netlify, merge jr-os-v2, verify merged tree and shared preview; report actual acceptance limits.

## Progress

- Clean isolated clone reused; new feature branch feat/quote-catalogue-search-20261101 starts at707793f5204967ed700ec4fd0dca63aaf4f5097e. No AGENTS.md found.
- Pre-flight: Task 1 output types match Task 2 inputs. Existing material pricing constructor, supplier sanitizer, identity index and durable-save ownership guards retain their contracts. No interface conflict.
- Baseline2,814 passed. Task1: seven new cases observed RED then16/16 helper/line tests GREEN. A test fixture inherited the other pack's material description unintentionally; that fixture was corrected without changing production matching.
- Task2: 11 new real-page cases observed RED then GREEN. A retained material with a malformed name also reproduced a raw React-child object (RED) and now renders review wording (GREEN). Removed-reference explicit recovery and unsafe URL exclusion are covered. All97 targeted tests passed, including prior account/source/session and exact save/retry contracts.
- Final local gates:2,834/2,834 tests, zero-warning ESLint and production TypeScript/build all passed. Fresh independent whole-branch review approved with no Critical/Important/Minor findings and no deferred judgments; no fix or re-review needed. Exact-tree hosted delivery remains the final step.
