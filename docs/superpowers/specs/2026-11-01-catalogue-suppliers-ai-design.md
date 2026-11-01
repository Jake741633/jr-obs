# Catalogue, wholesaler references and local estimating

Jake requested continued autonomous JR OS development: more job packs, codes and product links from multiple wholesalers, and stronger AI capabilities. Build on the existing optional catalogue importer, durable material editor and reviewed local estimating workflow. Integrate into the authorised jr-os-v2 development preview after green checks; production and hosted database/AI activation remain separate.

## Implementation choices

Extend the existing product record rather than duplicating one material per wholesaler. Preserve its existing supplier, stockCode and supplierUrl as the preferred source; add optional supplierOptions containing only id, supplier, stockCode and supplierUrl for other sources. Supplier codes and pasted HTTP(S) product links are entered and reviewed by the user; storing a link never fetches a website or invents a price/code.

Use the existing catalogue import for 24 new scoped templates (64 total). Preserve existing IDs and saved edits. Guide prices, labour and quantities remain unverified estimating allowances, with survey and certification review. Heating-controls wiring remains excluded.

Improve the existing local estimate engine rather than introduce a disconnected AI screen: parse included work separately from questions/exclusions, recognise common electrical wording, and require meaningful scope overlap before using saved packs/history. Materials and labour use consistent, unique, stable ranked sources. Connected AI request data, secrets, funding and permissions are unchanged.

Review fixes also require neutral-named packs to reveal extra work through their
descriptions/material schedules, distinct data/doorbell tasks to retain separate
allowances, and labour arithmetic to follow the saved rate unit. Malformed saved
supplier metadata must open a guarded review state and remain unchanged until
explicit replacement followed by Save.

## Wholesaler behaviour

- Up to 10 additional wholesalers per material. Each saved option needs a supplier name and a stock code or safe product link. Entirely empty rows are discarded. Malformed, duplicate or oversized entries need review.
- Add/edit/remove options inside the existing guarded material form; promote an option to preferred by swapping product references. Buying/selling allowances stay explicitly reviewed manual values.
- Searching and filtering find any saved supplier/code/link. Product cards expose per-supplier open/copy/share controls that contain no prices, private notes or customer records.
- Existing single-supplier records, saved quote snapshots and durable failure/account/changed-record guards keep working. Optional metadata uses the existing record payload; no database migration or access expansion.

## Acceptance

Test catalogue identities/valid linked schedules and non-overwriting import; multiple suppliers, preferred swaps, invalid URLs/duplicates, search/filter, stable retries and stale/account callbacks; source-scope parsing, exclusions, aliases, unrelated/ambiguous pack/history rejection and price/quantity preservation. Run full tests, lint, production build and independent review. Verify the deployed UI where browser access permits; real phone paste/share and confirmed cloud sync remain device acceptance.
