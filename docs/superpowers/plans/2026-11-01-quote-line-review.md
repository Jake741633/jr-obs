# Quote Line Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native execution. User authorises continued implementation and development-preview integration without further question gates.

**Goal:** Complete and review an editable labour/material draft on the phone without navigating away to add a missed material.

**Architecture:** A pure quote-line helper validates drafts and creates material allowances; the existing Quote Builder consumes it with current source/save guards. Local browsing state never becomes a saved line subset.

**Tech Stack:** Existing React/TypeScript, Node real-component harnesses, no dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-quote-line-review-design.md

## Global Constraints

- Saved buying/selling precision, preferred supplier/code and source records remain unchanged. Unknown prices are not zero.
- Positive finite labour hours are reviewed; hourly quantity changes also change its hours, other billing modes keep a separate explicit time allowance.
- Filtered lines remain in totals/saving; the current edited line does not disappear as soon as it becomes valid.
- No automatic record writes; existing durable-save/retry/customer/VAT and account/session/target/readiness guards remain.
- No dependencies, schemas, provider requests, credentials, paid calls or production release.

## Review Focus

- Duplicate/removed saved material ids and callbacks retained before a source refresh.
- Clearing and restoring hourly quantity; independent day/call-out hours, invalid/overflowing amounts.
- A line becomes complete while a review-only filter is open without losing focus or being omitted from save.
- Blank descriptions, ambiguous line ids and incomplete added allowances never produce a clean profit or saved quote.
- Account/readiness/session/unmount or saved-document changes cannot accept stale additions/edits.

### Task 1: Quote line contracts

**Files:** Create `lib/quoteDraftLines.ts`, `tests/quote-draft-lines.test.mjs`.

**Interfaces:** `reviewQuoteDraftLines(lines)` returns complete/cost totals and per-line fields requiring review; `editQuoteDraftLine(line, patch)` keeps hourly quantity/hours aligned; `materialQuoteDraftLine(materialOrNull, id)` returns a new material pricing line and cost basis.

- [x] RED cases for missing descriptions/identity/hours, exact material prices/source immutability, invalid values and hourly edits/repair versus independent other modes.
- [x] Implement only those contracts using existing `reviewEstimateCosts`/amount validation.
- [x] GREEN: `node --test tests/quote-draft-lines.test.mjs` (9 passed).

### Task 2: Phone editor integration

**Files:** Modify `app/ai/quote-builder/page.tsx`, `tests/ai-estimate-review-ui.test.mjs`.

- [x] RED consumer cases: saved/blank materials, retained source/account callbacks, description and time edits, review filter retention, current line totals and complete-only saving.
- [x] Add guarded material additions, editable line descriptions, per-line review feedback, line totals, stable review filtering and large remove controls.
- [x] Use the complete full draft for profitability/saving; update hourly labour time and support separate other-mode hours.
- [x] GREEN: `node --test tests/ai-estimate-review-ui.test.mjs tests/quote-draft-lines.test.mjs tests/ai-estimate-scope.test.mjs` (81 passed).

### Task 3: Verification and delivery

**Files:** Update `docs/MOBILE_APP.md`, `ROADMAP.md`, this plan.

- [x] Document the editor and existing unsaved/media/live acceptance limits.
- [ ] Full tests/lint/build, independent review and focused RED→GREEN fixes; publish PR, green CI, merge jr-os-v2 and verify shared preview.

## Progress

- Base a227097c1a1adca3be8358a186a1a956d9f94616; clean isolated branch `feat/quote-line-review-20261101`.
- Pre-flight: Task 1 validation and edit/material contracts feed Task 2. Source/save contexts remain authoritative; no interface conflict.
- Baseline 2,775 tests passed. Unit and consumer cases were observed RED before implementation; aggregate amount overflow and malformed source metadata also have targeted RED→GREEN coverage. The selection-change consumer fixture explicitly commits its state change before exercising a retained callback.
- Independent whole-branch review found one Important compile blocker: a readonly draft array was passed to the mutable identity-index signature (confirmed TS2345). The identity index only reads its source; its parameter now accepts readonly arrays without changing its output or runtime behavior. No additional findings were raised; no re-review is needed.
- Final full suite: 2,791 passed, zero failures; ESLint passed with zero warnings. The project build verifies the corrected readonly contract. Physical-phone and funded hosted-AI acceptance remain pending; this batch makes no provider calls.
