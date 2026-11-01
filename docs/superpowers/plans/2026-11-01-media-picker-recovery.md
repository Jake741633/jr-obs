# Phone Media Picker Recovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation. The user has authorised continued implementation and development-preview integration without further design gates.

**Goal:** Retain user-selected quote media across same-account phone picker/focus checks while preserving strict AI request invalidation.

**Architecture:** Add a component-local verified media-owner binding. Separate retained local evidence from the readiness/note-sensitive request context, keeping saved cloud evidence under its existing checks.

**Tech Stack:** Existing React/TypeScript and real-component Node harnesses; no dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-media-picker-recovery-design.md

## Global Constraints

- Same exact session/ownership epoch, mode, verified office role/organisation and target only; changed or failed identity never revives old media.
- AI/preparation/apply remain disabled during loading; delayed local file receipt never triggers a request or cloud write.
- Pending requests are cancelled and old scope results/apply callbacks remain invalid after readiness or notes change.
- Existing media size/count/duration, saved-job evidence and server boundaries remain unchanged.
- No shared auth changes, persistence, credentials, dependencies, paid requests or production release.

## Review Focus

- Native file events arrive before, during or after the identity loading snapshot.
- Loading without any previously verified office binding cannot collect media.
- Organisation/role/target or session changes away and back cannot revive old files or callbacks.
- Finished local preparation survives refresh, while pending preparation/transcription/scope does not.
- Replacing a recording or adding a photo while older preparation finishes never sends mixed/stale evidence.

### Task 1: Verified local-media continuity

**Files:** Create `lib/useQuoteMediaIdentity.ts`, `tests/quote-media-identity.test.mjs`.

**Interface:** `useQuoteMediaIdentity(identity: ReturnType<typeof useCloudIdentity>, target: string, track = true): QuoteMediaOwner | null`; owner contains immutable target/account identity and captured session ownership plus organisation/user IDs. Owner object identity remains stable only through a same-session loading cycle. Disabled tracking retires the binding without reading session state on unrelated routes.

- [x] RED tests: retain after same-account loading; refuse initial loading, local mode, failed/revoked identity, different context and replaced sessions; old binding never returns after switching back.
- [x] Implement the smallest component-local binding with current ownership checks and no storage/network work.
- [x] GREEN: `node --test tests/quote-media-identity.test.mjs` (6 tests).

### Task 2: Photo/video picker and finished-evidence recovery

**Files:** Modify `components/ai/ConnectedQuoteAssistant.tsx`, `components/ai/QuoteClipInput.tsx`, `components/CloudAccessGuard.tsx`, `app/ai/quote-builder/page.tsx`, `tests/connected-ai-ui.test.mjs`, `tests/quote-clip-ui.test.mjs`, `tests/ai-estimate-review-ui.test.mjs`, `tests/phone-app-installation.test.mjs`; create `tests/quote-media-mount-boundary.test.mjs`.

**Interface:** Parent binds local selections to `QuoteMediaOwner`; child receives stable `mediaContext` and `canSelectLocal` while normal `enabled`/request context stays readiness sensitive. Prepared local evidence uses a separate stable local context and captured ownership.

- [x] RED real-component regressions: delayed picker events during loading, completed media recovery, request/apply cancellation, failed verification/account switch/target/session changes, and latest-photo append semantics.
- [x] Implement local receipt guards, retain/hide finished local evidence through pending checks, and keep API/saved-record guards unchanged.
- [x] GREEN: `node --test tests/quote-media-mount-boundary.test.mjs tests/ai-estimate-review-ui.test.mjs tests/phone-app-installation.test.mjs tests/connected-ai-ui.test.mjs tests/quote-clip-ui.test.mjs tests/quote-media-identity.test.mjs` (109 tests).

### Task 3: Verification and development-preview integration

**Files:** Update `docs/CONNECTED_AI.md`, `docs/MOBILE_APP.md`, `ROADMAP.md`, this plan.

- [x] Document local recovery versus request invalidation, no durable storage and remaining device/live acceptance.
- [ ] Run full suite, lint and build, independent review with focused RED→GREEN fixes, publish PR, green CI, merge jr-os-v2 and verify shared preview.

## Progress

- Base: 42edfed658ce9a21f27c2b7620f30d61fc08e23c; isolated feature branch `feat/media-picker-recovery-20261101`.
- Pre-flight: Task 1 owner identity feeds Task 2 local evidence only. Normal request context remains unchanged in authority. No interface conflict.
- Baseline: 2,752 tests passed. Task 1 owner tests RED→GREEN; Task 2 nine media cases, raw-session disablement and four outer-mount cases reproduced before their fixes.
- Task 2 scope correction: component-only retention was insufficient because both outer access and page collection guards unmounted it. The exact quote route now retains only a last-verified same-session subtree hidden/inert during pending checks; existing role/path rules and all initial/failed/different-account unmounts remain. Review must assess the complete mounting chain and private-content visibility, not only media helper fixtures.
- Independent review: one Important finding reproduced in the real storage hook: its persistence effect could mirror old account rows into a legacy key on the first identity-loading render. Fixed by requiring current identity readiness before persistence and adding that dependency. Two RED→GREEN regressions assert absent legacy keys stay absent, existing legacy data remains unchanged, scoped data/queues remain intact and same-owner recovery reloads the proper data. Targeted review-fix run: 99 tests passed.
- The first full suite had 2,772 passes and one source-shape assertion failure (`operator-permissions` expecting direct identity destructuring). Preserved the established direct destructuring and narrowed the helper input to its three consumed fields; no permission expectation changed. Full post-fix verification follows.
- Review boundaries: physical picker delivery/disabled-fieldset timing, device codecs/memory, real React/assistive-tech behaviour, funded AI, live Supabase/RLS and production release remain acceptance work. Source structure and real-hook tests cover owner/callback/namespace transitions, not physical-device certification or a full platform security audit. No deferred code findings remain.
- Final tests: 2,775/2,775 passed after the review fix. Three legacy source-shape checks needed persistence-guard framing preserved and the expected dependency list updated for `identityReady`; the real-hook privacy regressions remain the behavioural proof. ESLint passed with zero warnings. Production build and development integration follow.
- Production build passed. No open review findings or deferred minors. Exact-source development CI, merge and deployment verification follow publication; physical-phone and funded live acceptance remain pending.
