# Quote Total Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation, then one fresh whole-branch review. Continuing user authorisation includes green-CI development-preview integration without another permission gate.

**Goal:** Review and adjust the complete quote's allowances and VAT-inclusive total on the phone before saving.

**Architecture:** A pure review helper composes existing line validation and the authoritative profitability engine. The page uses its fresh result for financial display and saving, edits local pricing settings only, and provides native section links.

**Tech Stack:** Existing React/TypeScript and Node real-page harness; no dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-quote-total-review-design.md

## Global Constraints

- Full-draft/exact numerical calculation; display rounding never changes saved lines/allowances.
- Quote-only contingency/travel/parking edits; no defaults/source writes or material repricing. Empty fields are unknown, explicit zero valid.
- Validate line review, calculated allowance amounts0..1e9, known VAT status/rate0..100, positive billable settings, margin0..100, unique valid active overheads and finite/bounded engine results. Inactive overheads ignored; negative profit retained.
- Only VAT registered charges VAT under existing net-price document semantics; no registration/price-basis change.
- Current-source/account/session/readiness/save and exact-retry guards remain. Invalid input withholds totals/profit/save; no silent zero/repair.
- At least48px native section links/controls; no overlay, dependencies, model/schema changes, provider calls, credentials, automatic writes, customer messages or production release.

## Review Focus

- Fractional unit prices/quantities and quote allowances reconcile exactly with saved net/VAT totals without double contingency, travel or parking.
- Empty/negative/nonfinite financial fields, zero billable hours, unrecognised VAT/overhead status and duplicates cannot show clean totals or save; genuine losses remain valid.
- Refreshed overhead/labour/VAT settings update the current review and saved snapshot without changing already priced lines.
- Retained allowance callbacks after source/draft/owner/readiness/unmount or saved-result changes reject edits; consecutive pre-render edits preserve all fields.
- Review filters and catalogue searches retain complete hidden lines; same-page links target current scope/lines/review without dropping unsaved edits.

### Task1: Pricing review contract

**Files:** Create lib/quoteDraftPricingReview.ts, tests/quote-draft-pricing-review.test.mjs.
**Interface:** reviewQuoteDraftPricing({items,pricing,overheads,labourSettings,vatSettings}) returns {complete,issues,profitability,totals}; issue union identifies lines, each calculated allowance, labourSettings, overheads, vat or totals. Inputs arrays are readonly; pass copies to existing mutable engine signature. Totals expose raw line subtotal, contingency, travel/parking selling allowances, net, VAT flag/rate/amount and gross total.

- [x] RED tests for hand-calculated full price/VAT, exact fractions and source immutability, three VAT statuses/invalids, individual unknown/negative/nonfinite allowances, invalid/duplicate/uncertain overheads versus inactive records, zero/invalid labour settings, bounded totals and valid losses.
- [x] Implement validation and delegate calculations; GREEN node --test tests/quote-draft-pricing-review.test.mjs tests/quote-draft-lines.test.mjs.
- [x] Commit helper/tests/spec/plan.

### Task2: Phone review/edit integration

**Files:** Modify app/ai/quote-builder/page.tsx, tests/ai-estimate-review-ui.test.mjs; update docs/MOBILE_APP.md, ROADMAP.md.
**Interfaces:** Consume Task1 for fresh live review and saved profitability/VAT. Local updateQuotePricing(patch) uses guarded functional state updates to accumulate allowance edits; save uses the validated complete review. Native Scope/Pricing/Review anchors point to rendered wrappers.

- [x] RED real-page cases: local allowance edits with exact review/save agreement and unchanged defaults/lines, clear/repair/zero and invalid-settings save blocking, consecutive edits, changed overhead/labour/VAT refresh, stale callbacks including saved/unmounted drafts, filtered full-draft saving and section target availability.
- [x] Implement allowance controls, fresh profitability and complete net/VAT/total review; add48px section links and existing business-settings recovery links without leaving the draft.
- [x] GREEN node --test tests/ai-estimate-review-ui.test.mjs tests/quote-draft-pricing-review.test.mjs tests/quote-draft-lines.test.mjs tests/quote-invoice-totals.test.mjs (111 passed).
- [x] Commit UI/tests/docs.

### Task3: Verification and delivery

- [x] Full npm test, npm run lint, npm run build; inspect outputs and exits.
- [x] One fresh read-only whole-branch review; grade by user impact, one RED→GREEN fix pass for Important/Critical findings and full verification; no re-review.
- [ ] Publish exact tested tree via PR, verify hosted CI/Netlify, merge jr-os-v2, confirm merged tree and shared preview; report actual acceptance limits.

## Progress

- Clean isolated clone reused; feat/quote-total-review-20261101 starts at a305c53ab4f74e19ee3ce230200fff3537066bbe. No AGENTS.md found.
- Pre-flight: Task1's current validated profitability/totals feed Task2's display/save. Existing calculateQuoteProfitability and saved-document VAT semantics retain their contracts; no conflicting interfaces. Baseline running before source changes.
- Baseline2,834 passed. Task1: nine cases observed RED, then18/18 pure pricing-review and existing line-contract tests passed. Readonly arrays are copied at the engine boundary.
- Task2: eight new real-page cases observed RED, then111/111 targeted page/pricing/line/invoice-total checks passed. A VM-array prototype difference in the defaults-immutability assertion was normalized with structuredClone; the actual allowances/defaults remained unchanged. Financial rows can wrap on narrow phones; no fixed overlay was added. Full verification and independent review follow.
- One fresh review identified a fractional-penny contingency component mismatch caused by arithmetic order. Root treated it as Important for review/save reconciliation, reproduced it in pure and page tests (RED), matched the engine operation order (GREEN), and reran the full suite:2,853/2,853. No re-review. Reviewer clarified there are no scope-based declined judgments or unresolved rulings; browser/local cross-tab/phone/live-AI acceptance remain integration boundaries. Final zero-warning ESLint and production TypeScript/build passed. Exact-tree hosted delivery remains the final step.
