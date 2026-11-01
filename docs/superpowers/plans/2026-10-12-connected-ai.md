# Connected AI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Existing user instructions authorize continued implementation and development-preview integration.

**Goal:** Add reviewed AI photo and notes assistance to the existing Quote Builder.

**Architecture:** A same-origin Next route validates the user's live Supabase membership and server business allowlist, then makes one bounded OpenAI Responses request. A transient client panel edits the validated result before a guarded handoff to quote notes.

**Tech Stack:** Existing Next 16, React 19, TypeScript, native fetch and Node tests; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-connected-ai.md`

## Global constraints

- No production merge, schema change, real CRM test records or secret in source/output.
- Server-only `OPENAI_API_KEY` and `JR_OS_AI_ORGANISATION_ID`; optional `OPENAI_MODEL`, default `gpt-5.6-terra`.
- Notes 12,000 characters; one JPEG <=1,500,000 bytes; request <=2,100,000 bytes; provider response <=100,000 bytes.
- No automatic retries, mutations, invented prices or video-analysis claims.

## Review focus

- Account/readiness/selection changes during photo preparation or a model request must discard the work.
- Revoked or moved memberships must not receive a completed answer.
- Chunked/false-content-length requests must still respect the byte limit.
- Old Apply callbacks cannot overwrite newer notes or apply twice.
- Quota exhaustion must be distinct from transient rate limiting and never reveal provider error content.

## Task 1: Server boundary and structured output

Files: `lib/connectedQuoteScope.mjs`, its declaration, `lib/server/quoteScope.mjs`, its declaration, `app/api/ai/quote-scope/route.ts`, `tests/connected-ai-server.test.mjs`.

Produces: `createQuoteScopeHandler({env, fetchImpl, now}) => (request: Request) => Promise<Response>`; shared `parseQuoteScope(unknown)` and `quoteScopeNotes(scope)`.

- [x] Write failing behavioral cases for authentication/origin/organisation/role/configuration, valid photo/notes output, response validation, size boundaries, errors, revocation and concurrent spending.
- [x] Run `node --test tests/connected-ai-server.test.mjs`; observe missing feature failures.
- [x] Implement the bounded provider and auth flow with safe fixed errors and strict output validation.
- [x] Run the targeted suite; require all cases to pass.

## Task 2: Reviewed quote-builder handoff

Files: `components/ai/ConnectedQuoteAssistant.tsx`, `app/ai/quote-builder/page.tsx`, `tests/connected-ai-ui.test.mjs`.

Consumes: shared result shape and notes formatter; POST status/draft operation.
Produces: `onApply(sourceNotes, reviewedNotes)` only after explicit review in the current account/target/source scope.

- [x] Write failing component-handler tests for explicit submission, role and session guards, stale work, duplicate taps, result review and current-note handoff.
- [x] Implement the phone panel with photo preparation, cancellation, connection feedback and editable scope.
- [x] Mount in Quote Builder and keep deterministic priced-draft wording accurate.
- [x] Run both targeted suites; require all cases to pass.

## Task 3: Verification and development integration

- [x] Update the roadmap and operator documentation with real activation status.
- [x] Run full tests, lint and production build; resolve failures.
- [x] Request independent review of the whole diff and address material findings.
- [ ] Publish feature PR to `jr-os-v2`, verify CI/deploy, merge only that preview branch and verify merged deployment. Keep production PR 1 draft/unmerged.
- [ ] Report the exhausted API credit balance and missing hosted secret activation plainly.

## Verification record

- Full local suite: 2,336 passed, zero failures; lint and production build passed.
- Independent review found an access-change window during a slow body upload. A failing delayed-upload regression reproduced it; live membership is now revalidated immediately before the paid call and again before returning output. Revoked, moved and role-changed cases pass.
- The ignored local secret has owner-only permissions and is absent from tracked source and browser build artifacts.
- Live authentication succeeded; generation remains blocked by exhausted API credit. Hosted secrets and successful live/physical-phone acceptance remain pending.
