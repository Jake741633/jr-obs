# Phone quote total review

## Intent and approach

Continue the authorised phone quoting workflow with a final review of the complete quote price before saving: line subtotal, contingency, travel, parking, net amount, VAT and total. Let the user adjust quote-specific contingency and travel/parking buying/selling allowances in place. Show current profitability when business overheads or labour settings refresh, rather than relying on an older draft snapshot.

Use the current React/TypeScript editor and calculateQuoteProfitability as the calculation authority. A separate wizard duplicates save state, while a fixed footer risks obscuring the existing mobile navigation. Use native same-page section links and one review card. These are implementer choices under continuing autonomous authorisation.

## Requirements

- Preserve full-draft calculations and exact numeric line/allowance precision. Review the complete draft even when the line-review filter hides rows. Saved document profitability, net price and VAT inputs must agree with the review. Display rounding must not change stored numbers.
- Quote-only controls edit contingencyPercent, travelCost, travelPrice, parkingCost and parkingPrice on draft.pricingSettings. Never mutate saved Quote Engine defaults, materials, rates or overheads; never reprice existing lines or reapply material markup. Clearing a financial field leaves it unknown (NaN), not an intentional zero; explicit zero is allowed.
- Reuse reviewQuoteDraftLines for line descriptions/identity/quantities/costs/prices/hours. Validate calculated pricing allowances as finite nonnegative values up to1,000,000,000; contingency is nonnegative and final amounts remain bounded. Validate VAT status as one of the existing three statuses and defaultRate as a finite number from0 through100. VAT is charged only for VAT registered, consistent with existing saved documents; registration pending is explicitly labelled uncharged. The existing saved-quote net-price contract remains authoritative; no gross/net reinterpretation of existing lines.
- Profitability needs positive finite workingDaysPerYear and billableHoursPerDay and a valid0–100 targetNetMargin. An active overhead must have one globally unique valid identity, a finite nonnegative supported amount and Weekly/Monthly/Annual frequency. Explicitly inactive overheads are ignored; unrecognised active status is uncertain rather than free. Validate finite engine results and supported monetary totals; valid negative profit remains visible.
- Incomplete lines or invalid financial/settings inputs withhold clean profitability/totals and block save with specific review feedback. Business settings are reviewed in their existing screens, opening a new tab to retain the unsaved draft. No settings are silently repaired or disabled.
- Fresh current-source/account/session/readiness/unmount and existing durable-save guards apply to allowance edits and save. Retained edits cannot alter a new/changed/saved draft. Consecutive edits before render accumulate rather than replacing another allowance change. Existing retry identities, customer/job validation, public notes and save recovery remain intact.
- Add accessible 48px same-page Scope, Pricing lines and Review total links while a draft exists, plus a return-to-pricing link near saving. Targets exist only in the current draft and browsing does not reset edits, filters, catalogue selections or AI media. No sticky overlay or new navigation route.

## Boundaries

No dependencies, model/schema/RLS changes, provider/network/paid AI calls, automatic record writes, outbound customer messaging or production release. This remains a draft; review the saved quote before sending. Signed-in physical-phone and funded hosted-AI acceptance remain separate.
