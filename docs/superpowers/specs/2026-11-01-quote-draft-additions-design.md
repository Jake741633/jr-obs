# Phone quote draft additions

## Intent and approach

Continue the authorised mobile quote work: add missing labour and reviewed whole job packs inside the current AI Quote Builder draft, after either local notes or checked media scope. Use the existing React/TypeScript editor and saved-price pack expansion. This is the implementer's choice under the user's continuing autonomous instruction.

Alternatives were navigation to the full Quote Engine (loses the quick in-draft flow) and a new quote wizard (duplicates current save and calculation contracts). Small disclosures in the existing editor preserve the established workflow and guards.

## Requirements

- Add one uniquely identified active saved labour rate or a blank fixed labour allowance. Exact saved cost/charge rates remain numeric and unrounded; missing or invalid prices remain unknown, never automatic zero. Sources remain unchanged.
- Saved Hour uses Hours mode, quantity 1 and labourHours 1. Day uses Days; Half day, Call-out and Minimum charge use Fixed. Every non-hour addition starts with an unrecorded time allowance; the user must enter positive hours. Unknown units cannot silently become hourly. The displayed description identifies the saved billing unit.
- Add one uniquely identified named saved pack after previewing its lines and public scope, testing, certification and exclusions. Use existing jobPackQuoteLines quantities, fixed labour selling allowance, optional other charges and unique linked material references/cost fallback. Do not reprice using live/library selling prices. Labour buying cost stays unknown. Empty, malformed, duplicate-line or legacy-Other-note packs cannot be added partially.
- Public pack description/testing/certification/notes shown in the preview are appended to editable draft notes on explicit Add; internalNotes are not copied into customer notes or pricing lines. The detected scope also identifies the manually added pack. The original draft title, settings, lines and notes are preserved.
- Clearly explain that every add appends separate lines and may overlap the generated draft. No silent merges or automatic quantity scaling. Appending is atomic with fresh unique line identities, checks collision with existing lines, and rejects synchronous repeated callbacks. A later deliberate addition after render remains possible.
- Reuse current account/session/unmount, collection readiness, source, selection and durable-save guards. Old callbacks cannot add a previously selected, refreshed, removed or ambiguous source, or change an already saved draft.
- New lines stay visible in a held review-only filter. Full-draft calculations/save remain authoritative; blank descriptions/costs/prices/hours block clean profit/save. Use 48px phone controls.

## Boundaries

No new dependencies, persistence models, schema/RLS changes, network/provider calls, credentials, automatic live record writes or production release. Original packs/rates/materials are read-only. Existing source material additions and media recovery remain supported. Real signed-in phone and funded hosted-AI acceptance remain separate from deterministic tests and signed-out preview smoke checks.
