# Quote Video and Speech Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline implementation. The user has authorised continuing the roadmap and development-preview integration.

**Goal:** Use reviewed speech and sampled video frames to prepare quote scope.

**Architecture:** Browser preparation produces bounded sound and stills. The existing authenticated quote-scope route gains a transcription operation and a sampled-frame draft input; both share the live membership and spending guards. A separate clip panel hands reviewed evidence to the existing quote assistant without saving a quote or job.

**Tech stack:** Existing Next, React, TypeScript, native browser media APIs, fetch and Node tests. No new dependencies.

**Spec:** docs/superpowers/specs/2026-10-12-quote-video-speech.md

## Global constraints

- Source <=100 MiB and <=60 seconds; prepared audio <=1,500,000 bytes; at most three JPEGs <=250,000 bytes and 960px long edge.
- Request <=2,100,000 bytes, provider response <=100,000 bytes, transcript/combined notes <=12,000 characters.
- Existing key and business allowlist, active owner/admin/office access, three live membership checks, four paid starts/minute and one concurrent call per process.
- No automatic sharing, retries, cloud writes, extra dependencies, schema changes or production merge.

## Review focus

- Late loadeddata/seek/recording callbacks after cancellation must not leak a blob URL, stream or AudioContext.
- Short or silent files and codecs unavailable on iPhone must give an honest result and preserve editable notes.
- Old child-panel callbacks after parent photo/account/target/readiness changes must not replace evidence.
- Speech and scope calls share the same burst/single-flight protection and require revalidation after slow uploads.
- Incomplete transcription or partial frame preparation must never be silently presented as the complete recording.

## Task 1: Server media boundary

Files: lib/server/quoteScope.mjs, lib/server/quoteMedia.mjs, tests/connected-ai-media-server.test.mjs.

Interface: the existing handler accepts consented transcribe requests with inline audio and returns transcript; draft optionally accepts frames [{dataUrl, seconds}]. validateQuoteAudio returns validated bytes/type/extension or null; validateQuoteFrames validates the exact frame shape. Both operations use the existing auth and spend lifecycle.

- [x] Write and observe failing tests for valid MP4/WebM sound, consent/byte/signature/URL rejection, frame exclusivity/order/size, empty/malformed text, quota errors, shared single-flight/rate limits and revoked membership during upload/output.
- [x] Implement validation and provider branching with fixed endpoints and gpt-transcribe default.
- [x] Run existing and new server suites and commit the server deliverable. Expected: all cases pass.

## Task 2: Local clip preparation

Files: lib/quoteClip.ts, tests/quote-clip.test.mjs.

Interface: prepareQuoteClip(file, {signal, speech, onProgress}) returns {audio: string|null, frames: ClipFrame[], duration: number}; clipFileError validates metadata; clipNotes(notes, transcript) creates attributed input or rejects excessive text. The helper owns all temporary media resources.

- [x] Write and observe failing tests for size/type/duration, generated sound/stills, unsupported recorder, frame-only preparation, oversize output, abort/background/timeout and cleanup of URLs/tracks/contexts.
- [x] Implement local preparation with explicit synchronous playback/AudioContext activation, bounded waits, cancellable frame capture, real-time audio extraction and finally cleanup.
- [x] Run the helper suite and commit. Expected: all cases pass.

## Task 3: Reviewed clip handoff and integration

Files: components/ai/QuoteClipInput.tsx, components/ai/ConnectedQuoteAssistant.tsx, tests/connected-ai-ui.test.mjs, tests/quote-clip-ui.test.mjs, docs/CONNECTED_AI.md, ROADMAP.md.

Interface: QuoteClipInput receives context, enabled, notes and onUse(reviewedClip). Parent retains evidence within the current source scope; scope requests use clipNotes plus frames. No change to the quote page's final reviewed-note callback.

- [x] Write and observe failing tests for explicit prepare/transcribe/review/use, frames-only use, stale session/source/parent callbacks, duplicate taps, cancellation and billing failures.
- [x] Implement the clip panel and parent handoff; label sharing, sampled-frame limits and source retention clearly.
- [x] Update operator/roadmap documentation, run targeted and full tests, lint/build, then independent whole-branch review and fix material findings with regressions. Final local checks: 2,365/2,365 tests, lint and build pass; startup cancellation review finding covered by six observed RED-to-GREEN regressions.
- [ ] Publish feature PR only to jr-os-v2; verify feature CI/Netlify, merge and verify the exact merged deployment. Keep production PR 1 draft/unmerged.

## Activation checkpoint

The existing ignored owner-only local key is present. The connector still has no Netlify environment-write capability, and the previous secure sign-in expired. No further paid smoke request will be sent without evidence the exhausted API credit was replenished. This does not block building/testing the remaining media workflow with isolated fake provider responses.
