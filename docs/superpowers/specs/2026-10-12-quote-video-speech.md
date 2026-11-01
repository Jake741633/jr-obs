# Reviewed site clips for quote preparation

Jake wants to walk through a job on his phone, describe the work in a video and use what is said and shown to prepare a builder/customer quote. This extends the existing reviewed quote workflow. Existing instructions authorise autonomous implementation and development-preview integration; production release and database changes remain excluded.

The chosen approach prepares a short clip locally, transcribes its sound through the existing authenticated AI boundary, and offers sampled video frames to the scope model. Direct raw-video submission would exceed hosting limits for normal phone recordings; durable private large-file storage is a separate roadmap item. This batch adds no dependencies, schema changes, remote media downloads or automatic CRM writes.

## Workflow and bounds

- Select an audio/video file, at most 100 MiB and 60 seconds. Browser-supported MP4/MOV/WebM and MP3/M4A/WAV can be prepared; unreadable codecs fail clearly. No microphone permission or recording starts automatically.
- Prepare on the phone. Video yields up to three JPEG stills, each at most 250,000 bytes with a 960-pixel long edge and a displayed time. Audio is recorded from local playback using AudioContext and MediaRecorder into MP4 or WebM, at most 1,500,000 bytes. Preparation can take the recording's duration. Cancel, hide, unmount or change context discards work and releases media resources. A frames-only option works without the audio APIs.
- An explicit Transcribe speech button sends only the prepared sound to OpenAI, using the same verified business/office account and configured key. The server's transcribe operation uses gpt-transcribe by default, optional OPENAI_TRANSCRIBE_MODEL, fixed /v1/audio/transcriptions, bounded multipart upload, safe errors, no automatic retry or persistence. Request JSON remains bounded to 2,100,000 bytes; provider JSON to 100,000 bytes. Model text must be nonempty and at most 12,000 characters.
- Edit the transcript and explicitly check it before using it. A separate action can use only the sampled frames. Using reviewed clip evidence changes only the transient AI panel. The scope request includes the visible typed notes, attributed reviewed transcript and selected frames; the original recording is not uploaded or saved.
- Scope accepts either the existing single photo or up to three time-labelled frames, never both. Frames are JPEGs with valid base64/magic, no more than 250,000 bytes each, strictly increasing finite times between 0 and 60 seconds. The model is told these are sampled stills, not a full video. Existing unpriced scope and human-review constraints remain.
- Account, readiness, role, job/customer selection, notes, chosen media and session ownership changes invalidate pending preparation, transcription and application. Stale callbacks and double taps cannot send or apply work to another context. Reviewed source notes plus transcript must fit 12,000 characters.

## Acceptance

Verify codec/duration/byte boundaries, cancellation and resource cleanup; explicit sends, source invalidation and duplicate-tap guards; server consent/authentication/three membership checks/shared concurrency limits, audio signature and frame validation, malformed/empty/oversized output and safe billing errors. Run full tests, lint/build and independent review before publishing only to jr-os-v2. Live generation, hosted secret activation and signed-in physical-phone compatibility remain pending until access/funding and devices are available.

References: https://developers.openai.com/api/docs/guides/speech-to-text ; https://developers.openai.com/api/docs/models/gpt-transcribe ; https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource ; https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination ; https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
