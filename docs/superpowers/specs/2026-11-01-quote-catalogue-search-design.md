# Find catalogue items inside phone quotes

## Intent and approach

Continue the authorised phone quoting improvements: find saved materials by name, manufacturer, category, wholesaler, stock code or saved product link, and find job packs by work description. A material's quote line can explicitly use another saved wholesaler reference without editing its preferred source or prices.

Use small search inputs and a selected-item preview alongside the existing native selectors. This extends current React/TypeScript controls and guards. Large replacement card lists add scrolling and another picker implementation; remote supplier search would add latency, cost and unrelated network behavior. Local filtering is the implementer's choice under the user's continuing autonomous instruction.

## Requirements

- Search is case-insensitive and all whitespace-separated words must match allowed public catalogue fields. Preserve stock codes as strings, including leading zeroes. Product links match saved safe references locally; do not fetch, import or normalize away meaningful URL queries. No match does not claim an item is unavailable at a supplier.
- Index material name/manufacturer/category/unit and sanitized materialSupplierReferences only. Exclude private notes, prices, identity strings and malformed/ambiguous additional supplier references. Search packs by name/category/description/labour description/material line descriptions; exclude private notes and financial data.
- Resolve globally unique nonblank material/pack identities before filtering. Duplicate records cannot become selectable merely because only one matches the query. Source arrays and records stay unchanged.
- Search changes and Clear actions reset that picker's selection (and material wholesaler choice) without changing draft items, edited notes, review list, totals or any saved record. Show matching counts and explain empty results. New priced drafts reset both catalogue searches.
- Material selection shows exact saved buying/selling allowances (display formatted only), unit, selected supplier/code/link and whether another saved reference is used. Read-only code/link fields are copyable. No reference-specific live price is claimed.
- Default is the saved preferred reference, including materials with no saved supplier metadata. Additional choices come only from sanitized uniquely identified saved references. Explicitly selecting one copies only its supplier/code into the new pricing line; materialId, quantities, price precision and cost basis retain the existing contract. Product links are preview/search metadata; PricingLineItem has no supplierUrl field. No source preference or price is changed.
- Clear, changed, removed, duplicated, refreshed or unmounted choices and account/readiness/session changes reject retained add callbacks, even after selecting away and back. Material/ref/search and pack/search each have a committed picker context; read-only catalogue changes must not invalidate unrelated AI media work. Existing source/save guards, no-partial-addition protection, review filter and full-draft saving remain authoritative.
- Use at least 48px touch controls with search keyboard actions and accessible labels. These features make no network/provider calls and introduce no automatic persistence or external sharing.

## Boundaries

No dependencies, models/schema/RLS changes, provider credentials, supplier scraping, paid AI calls, production release or automatic record writes. Signed-in phone and funded hosted-AI acceptance remain separate. Materials not already saved can still use a blank allowance; this search does not create a catalogue item.
