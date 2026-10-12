# Connected AI quote scope

Quote Builder includes **Review notes and a photo with connected AI**. The user chooses one camera/gallery photo and explicitly submits it with the notes currently visible in the form. OpenAI returns an unpriced scope, questions and exclusions. The user edits and checks this text, then chooses **Use reviewed scope in quote notes**. The existing priced draft is cleared so it must be rebuilt and checked using saved pricing settings.

This step does not save/send a quote, alter a job, send the CRM, upload a video or transcribe audio. The photo is transient; save job evidence through the separate job capture form. The deterministic priced-draft button is labelled **Create priced draft from notes**.

## Server activation

All values below are server settings, never `NEXT_PUBLIC_` secrets:

| Setting | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Securely provisioned OpenAI project key. |
| `JR_OS_AI_ORGANISATION_ID` | Exactly one existing JR OS business organisation ID allowed to use this key. Requests from other businesses fail closed. |
| `OPENAI_MODEL` | Optional model override; defaults to `gpt-5.6-terra`. Validate model access and structured-output compatibility before changing. |

Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also required for live account validation. No Supabase service-role key is used. Active owner/admin/office membership is read under the caller's token before accepting the body, after the upload immediately before the paid request, and again before returning the answer. The browser sends its current organisation as an expectation, not authority.

Set the private settings in the intended Netlify deploy context with Functions and Builds scopes, then redeploy. Development-preview setup must not activate production. Never commit `.env.local` or put the key in the browser, a URL, a screenshot, a PR, logs or a Library artifact. The connection check only confirms server configuration; an actual review tests billing and model access.

## Limits and failure behavior

- Notes: 12,000 characters; JPEG: 1,500,000 bytes after existing browser optimisation (source up to 25 MiB).
- Request: 2,100,000 bytes, enforced while reading even with no/false Content-Length. Only inline JPEG data is accepted; URLs cannot trigger server-side downloads.
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

The automated tests use fake network responses at the external boundary. Signed-in physical-phone checks, successful live generation and hosted activation remain acceptance requirements.

References: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Supabase verified user](https://supabase.com/docs/reference/javascript/auth-getuser).
