# Site Media Quote Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation in this session. Steps use checkbox tracking. The user has authorised continuing development and integration into jr-os-v2 without further design gates.

**Goal:** Add multiple photos and a short video to the AI quote flow and build reviewed labour/material drafts from that evidence.

**Architecture:** Extend the existing scope endpoint with bounded multiple JPEG inputs. Keep evidence transient, review the unpriced scope explicitly, and feed the exact reviewed text to the existing saved-price estimator.

**Tech Stack:** Next.js, React, TypeScript, existing canvas/media APIs and Node tests; no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-media-quotes-design.md

## Global Constraints

- Up to six photos, at most 25 MiB per source / 100 MiB combined; prepared JPEG at most 250,000 bytes.
- Existing recordings: at most 60 seconds / 100 MiB, up to three sampled frames; photos plus frames at most six.
- Keep request cap 2,100,000 bytes, five-field unpriced scope schema and existing AI access/session/spending guards.
- Reuse existing configured AI boundary; no credentials, hosted activation, schema/RLS, dependencies, paid requests or production release.
- Explicit reviewed draft creation only; no automatic quote saves or sends, no silently rescaled saved allowances.

## Review Focus

- Additional selections or removals during pending preparation cannot submit old evidence.
- Invalid/oversize batch leaves previous photo and recording selections intact.
- Photos + video at the combined image boundary are either all included or rejected visibly.
- Checked scope builds a draft from the reviewed text, even when typed notes describe different work.
- Session/readiness/target/source changes and retained callbacks cannot build/apply stale drafts or write records.

## Task 1: Bounded multiple-image preparation and endpoint

**Files:** Create `lib/quotePhotos.ts`, `tests/quote-photos.test.mjs`; modify `lib/server/quoteMedia.mjs`, `lib/server/quoteScope.mjs`, `tests/connected-ai-media-server.test.mjs`.

**Interfaces:** `quotePhotoSelectionError(files: File[], frameCount?: number): string | null`; `prepareQuotePhoto(file: File, signal?: AbortSignal): Promise<{dataUrl: string; fileName: string; mimeType: string}>`. Endpoint new optional `photos: string[]`; legacy `photo` unchanged in isolation.

- [x] Write and run RED tests for six-photo and mixed three-photo/three-frame payloads, malformed/over-limit combinations and maximum-byte request; preserve legacy behaviour.
- [x] Implement strict media validation, labelled provider photos and requested-work/overlapping-view instructions without changing output fields.
- [x] Write and run RED preparation tests for limits, downsampling, errors, abort and cleanup; implement bounded sequentially consumed JPEG preparation using existing browser conventions.
- [x] GREEN: `node --test tests/quote-photos.test.mjs tests/connected-ai-server.test.mjs tests/connected-ai-media-server.test.mjs tests/connected-ai-origin.test.mjs` (34 passed).

## Task 2: Phone photo/video selection and scope review

**Files:** Modify `components/ai/ConnectedQuoteAssistant.tsx`, `components/ai/QuoteClipInput.tsx`, `tests/connected-ai-ui.test.mjs`, `tests/quote-clip-ui.test.mjs`.

**Interfaces:** Existing `onApply(sourceNotes, reviewedNotes)` remains. Add optional `onBuildDraft(sourceNotes, reviewedNotes)`. Use Task 1 preparation; send a single upload through legacy `photo` only for saved evidence, new upload batches through `photos`.

- [x] RED tests for append/remove/invalid batch preservation, mixed evidence, cancellation/staleness, and checked exact-text single-use build action.
- [x] Implement a directly visible AI panel, labelled mobile media controls, filenames/prepared previews, clear recording without dropping photos, progress and bounded all-or-nothing request construction.
- [x] Preserve saved-evidence identity checks and existing notes-only/connection operations. Keep explicit speech review and frame-only use options.
- [x] GREEN: `node --test tests/connected-ai-ui.test.mjs tests/quote-clip-ui.test.mjs tests/quote-photos.test.mjs` (44 passed).

## Task 3: Reviewed scope to local priced draft and delivery

**Files:** Modify `app/ai/quote-builder/page.tsx`, `tests/ai-estimate-review-ui.test.mjs`, `docs/CONNECTED_AI.md`, `docs/MOBILE_APP.md`, `ROADMAP.md`.

**Interfaces:** `generateDraft(sourceNotes: string): boolean` runs the existing estimator on explicit text and returns success; event handlers invoke it through wrappers. Both notes and draft update only on a current authorised review.

- [x] RED consumer tests: checked scope builds correct material/labour lines from reviewed text, no persistence, no stale callback after notes/target/readiness changes; notes-only still clears old draft.
- [x] Implement exact-text build callback, mobile flow wording, separate labour/material presentation and missing-source guidance while retaining save gates.
- [x] GREEN: `node --test tests/ai-estimate-review-ui.test.mjs tests/connected-ai-ui.test.mjs tests/ai-estimate-scope.test.mjs` (94 passed before review; full post-review checks below).
- [x] Update documentation with precise media, pricing, retention and activation limits.
- [ ] Run `npm test`, `npm run lint`, `npm run build`; independent whole-branch review and TDD fixes; publish PR, green CI and merge to jr-os-v2; verify development deployment.

## Progress

- Baseline: 2,724 tests passed; branch `feat/media-quotes-20261101` based on `4f68b4f`.
- Pre-flight: Task 1 photo helper return shape feeds Task 2; Task 2 callback exact strings feed Task 3. No interface conflict. Tasks execute in order; read-only backend recon completed separately.
- Task 1 complete: 34 targeted tests passed after 7 expected RED failures; no API calls.
- Task 2 complete: 44 targeted tests passed after 12 expected RED failures against previous components. Corrected the test loader to execute the real local TypeScript helper graph before confirming RED. No partial media send or stale build callback succeeded.
- Task 3 initial: 4 RED consumer cases, then 94 targeted tests passed. Full suite 2,745 passed; lint and build passed.
- Final review: two Important findings reproduced (pending additions; stale invoice snapshot). Recording correction regraded from Minor to Important because repeating preparation and paid transcription after removing a photo wastes time and API usage. All three fixed with seven RED→GREEN regressions; 83 consumer tests passed. No deferred minors.
- Final review boundaries: the notes-only page callback relies on the actual assistant caller's session-ownership check; no reachable bypass was found and no record write occurs. Raw same-identity session replacement recovery relies on the real identity hook's readiness refresh. Phone focus/picker event ordering, codecs/orientation/memory and speech/model accuracy remain live acceptance work, with transient evidence never described as durable storage. Hosted activation/funding/production stay separate. Existing pricing/rounding, saved-photo timeout, JPEG-marker validation and process-local spending protections were retained; no branch regression established. Navigation continues to require saving the transient draft first. These boundaries are documented rather than expanded into unrelated changes.
- Final local verification: 2,752/2,752 tests passed; ESLint passed with zero warnings; production build passed. Review findings are fixed with regressions. Development CI/deployment verification follows publishing; no funded AI or signed-in phone acceptance is claimed.
