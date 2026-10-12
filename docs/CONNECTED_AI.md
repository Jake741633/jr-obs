# Connected AI quote scope

Quote Builder includes **Review notes, photos or a site recording with AI**. The user chooses one camera/gallery photo and explicitly submits it with the notes currently visible in the form. OpenAI returns an unpriced scope, questions and exclusions. The user edits and checks this text, then chooses **Use reviewed scope in quote notes**. The existing priced draft is cleared so it must be rebuilt and checked using saved pricing settings.

This step does not save/send a quote, alter a job or send the CRM. The original video is not uploaded or saved by the AI workflow. Photo/clip evidence is transient; save job evidence through the separate job capture form. The deterministic priced-draft button is labelled **Create priced draft from notes**.

## Server activation

All values below are server settings, never `NEXT_PUBLIC_` secrets:

| Setting | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Securely provisioned OpenAI project key. |
| `JR_OS_AI_ORGANISATION_ID` | Exactly one existing JR OS business organisation ID allowed to use this key. Requests from other businesses fail closed. |
| `OPENAI_MODEL` | Optional scope model override; defaults to `gpt-5.6-terra`. Validate model access and structured-output compatibility before changing. |
| `OPENAI_TRANSCRIBE_MODEL` | Optional file transcription model; defaults to `gpt-transcribe`. Model access still requires a funded live check. |

Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also required for live account validation. No Supabase service-role key is used. Active owner/admin/office membership is read under the caller's token before accepting the body, after the upload immediately before the paid request, and again before returning the answer. The browser sends its current organisation as an expectation, not authority.

Set the private settings in the intended Netlify deploy context with Functions and Builds scopes, then redeploy. Development-preview setup must not activate production. Never commit `.env.local` or put the key in the browser, a URL, a screenshot, a PR, logs or a Library artifact. The connection check only confirms server configuration; an actual review tests billing and model access.

## Site video and spoken notes

Open **Use a short video or voice recording** inside Quote Builder's AI panel. Choose a saved recording or use the phone's camera control. Keep clips to 60 seconds and 100 MiB or less. MP4/MOV/WebM video and MP3/M4A/WAV/WebM audio depend on the phone's decoder; an unreadable codec gives an explicit error.

1. **Prepare sound and frames** works locally. It samples up to three stills and prepares compressed sound by playing the clip through a local audio graph. This can take the recording's duration. No microphone recording or cloud upload starts automatically. Keep JR OS visible; hiding it or cancelling discards incomplete preparation.
2. **Transcribe speech** explicitly sends only the prepared MP4/WebM sound to OpenAI. Edit and check the result against the recording. Empty or malformed results are errors, not successful transcripts. Silence/background noise can still confuse transcription; human review remains required.
3. **Use checked transcript and frames** selects this evidence for the AI scope request. The typed notes remain visible and unchanged. Alternatively, use **Prepare video frames only** and **Use video frames without speech** with typed notes.
4. **Review with AI** sends the visible typed notes, attributed reviewed transcript and selected stills. The model sees sampled images, not every moment of the video. Review the scope before applying it to quote notes and preparing prices.

The helper releases playback, audio tracks/contexts and object URLs on completion, cancellation, failure or backgrounding. No clip, transient transcript or model response is written to localStorage or cloud records. Saving durable job media remains the separate job evidence workflow; direct large private video-file storage is still pending.

Prepared audio is limited to 1,500,000 bytes. Video stills have a 960-pixel long edge and a 250,000-byte limit per JPEG, with at most three increasing timestamps between 0 and 60 seconds. The request accepts either these frames or the existing photo, never both. Combined typed notes plus attributed transcript remain under 12,000 characters. Transcription and scope share the same authentication, bounded input/response, single-flight and burst-limit lifecycle.

## Limits and failure behavior

- Notes: 12,000 characters; JPEG: 1,500,000 bytes after existing browser optimisation (source up to 25 MiB).
- Request: 2,100,000 bytes, enforced while reading even with no/false Content-Length. Only validated inline JPEG frames/photos or prepared MP4/WebM sound are accepted; URLs cannot trigger server-side downloads.
- Provider response: 100,000 bytes, strict schema plus application validation, no incomplete/refused/malformed answer shown as a draft.
- Provider timeout: 40 seconds. No automatic retries. Per-process single-flight and four starts/minute are accidental-repeat protection, not a distributed spending cap. Use OpenAI project billing/usage controls for the actual account budget.
- No model tools or stored Responses object (`store: false`). This does not promise zero provider retention; OpenAI's applicable API data policies still apply.
- Account, permission, readiness, selected target, input and session changes invalidate pending work. Old Apply callbacks cannot overwrite new notes. No transient AI response is saved to localStorage or the cloud.
- Exhausted API credit returns a specific billing message; transient rate limits are separate. Provider error bodies are never forwarded or logged.

The output remains a suggestion. Confirm design, quantities, specifications, access, testing and exclusions. Photos do not establish hidden wiring, available supply or compliance. Heating-controls wiring is excluded. The AI has no pricing fields; use the saved business pricing/VAT settings when preparing the priced draft.

## Activation evidence, 12 October 2026

- A new key named JR OS was securely written to the confirmed ignored local `.env.local` with owner-only permissions. No key is in git.
- OpenAI model-list authentication returned HTTP 200.
- The minimal Responses smoke request returned HTTP 429, `credit_balance_exhausted` / `insufficient_quota`. Generation has **not** succeeded. Add API credit at https://platform.openai.com/settings/organization/billing before further live generation checks.
- Hosted secret activation has **not** been performed: the exposed Netlify connector does not include an environment-write operation. The hosted UI must not be described as live/connected yet.
- No real customer notes, photos or job records were sent during the connection checks.

The automated tests use fake network responses at the external boundary. Signed-in physical-phone codec and sound/frame fidelity checks, successful live generation and hosted activation remain acceptance requirements. Live transcription accuracy, silence and semantic completeness are not certified: a transcript may omit or invent details, so the review gate remains necessary.

The 60-second source limit is enforced by the browser. The server checks encoded bytes and container signatures, not decoded audio duration; a direct authenticated request can submit a longer compressed recording and incur more API usage. Per-process guards are not a distributed spending limit. Original recordings are not retained by this flow; keep them separately until durable private large-video storage is available.

References: [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Supabase verified user](https://supabase.com/docs/reference/javascript/auth-getuser).
