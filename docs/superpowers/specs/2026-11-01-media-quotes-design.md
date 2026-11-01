# Quotes from site photos and video

Jake asked to continue JR OS development so photographs and videos can help prepare quotes, labour and materials. Existing autonomous development-preview integration is authorised. This extends the existing authenticated, reviewed scope flow and local saved-price estimator, using the previously provisioned JR OS AI configuration. No new key, paid acceptance request, hosted configuration or production release is included.

## Approach

Keep one quote workflow: add camera/gallery photographs and an optional short recording; review the AI scope; explicitly build an editable labour/materials draft using saved packs, rates, costs and business defaults. Raw video upload would need new durable binary storage and larger hosting limits. Model-generated prices would lose the business's saved price basis. Neither is required for this request.

## Behaviour

- The AI panel is directly visible in Quote Builder. Its primary actions describe photos/video and the following scope → labour/materials → quote review steps.
- Add up to six photographs, each source at most 25 MiB and combined sources at most 100 MiB. Repeated selections append in order; remove individual photos. Invalid/over-limit choices leave the previous selection intact. Show names and prepared previews before the explicit AI send.
- A reviewed short recording can accompany the photographs. Existing recording limits remain 60 seconds and 100 MiB. At most six images total are sent, counting the sampled frames (up to three). Oversize combinations require removing photos/recording; never silently drop evidence.
- Prepare camera/gallery photos locally as JPEGs, each at most 250,000 bytes. Show preparation progress; cancellation/account, notes, target or source changes prevent pending sends and stale application. Unreadable/unsupported photos fail visibly, preserving all selections for correction.
- The API accepts `photos: string[]` with 1–6 JPEG data URLs plus optional existing `frames`, at most six images together. Keep legacy `photo` only when neither new photos nor frames is present. Supplied empty arrays and malformed/remote/raw video inputs are rejected. Existing 2,100,000-byte request cap, office authentication, business allowlist, membership rechecks, concurrency controls and response schema remain.
- AI scope describes requested work with its stated counts, locations and specifications. Existing observations belong in summary; missing/conflicting counts, routes, specifications and assumptions become questions. Repeated views are not added together. Hidden wiring/compliance and labour durations/prices are never inferred as established facts.
- A checked scope offers both the existing notes-only action and **Build labour & materials draft**. The latter builds immediately from the exact reviewed text, rather than waiting for React's note update. It never saves or sends a quote. Retained callbacks, double taps and changed contexts cannot create or overwrite a draft.
- Show separate labour and material lines, missing saved rates/catalogue guidance and clear quantity/allowance review. Existing pack quantities and prices remain exact and editable; no silent scaling from visual counts. Existing customer selection, profitability, VAT and durable draft-save gates remain.

## Constraints and acceptance

No schema, RLS, dependencies, remote media fetches, automatic camera/microphone permission, CRM writes or paid AI calls. Original photos/video are not retained by this transient quote helper; saving job evidence remains separate. Physical-phone codecs, signed-in cloud sync, funded AI output and hosted activation remain explicit acceptance limits. Verify deterministic media boundaries and real UI callbacks, full tests, lint, production build, independent review, green CI and the development preview.
