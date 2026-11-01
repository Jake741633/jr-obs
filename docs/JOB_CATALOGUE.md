# Electrical job catalogue

## Approved scope

The catalogue contains 64 editable electrical job packs and 129 generic materials,
from small socket and lighting jobs through five rewire examples. Heating-controls
wiring is excluded. Templates are estimating aids, not verified circuit designs,
live supplier quotes or reconstructed actual bills of materials.

Completed JR job amounts are explicitly labelled historical benchmarks in internal
pricing notes. Where the actual buying cost is unknown, the catalogue does not
claim that a selling allowance or an incomplete supplier basket is the actual cost.
Rewire examples have no claimed completed-job cost evidence. Site conditions,
quantities, routes, access, protection, testing and notification require review.

## Daily workflow

1. Open Job Packs → Browse & add starter catalogue, or Starter Library.
2. Review the notice and tick the estimates acknowledgement. Choose Add missing
   job packs & materials, or materials only.
3. Edit your saved pack's scope, hours, buying costs and selling allowances.
4. In Materials, paste verified supplier codes and product links into their
   fields. Use Other wholesalers → Add wholesaler for other references to the
   same product; each row can have a stock code, a product link, or both. Generic
   starters intentionally have no fabricated codes or URLs.
5. Add the pack in Quotes, review the actual job and costs, and check VAT settings
   before sending. Importing the catalogue never sends quotes or places orders.

Imports are optional and add missing IDs only. Existing starter records and user
edits are preserved, including the previous 101 materials and 40 packs. Importing
does not upgrade an existing starter with newer template values. Edit that saved
record manually when you want to change it. Material records save before packs.
If saving fails partway, completed records remain and a retry adds only missing
records. Local persistence/queued sync is not claimed as confirmed cloud sync.

## Multiple wholesaler references

The existing Supplier, Stock code and Supplier link remain the preferred source
used by quotes and purchase lists. A material can also store up to ten additional
wholesalers. Each row needs a supplier name and a stock code or valid HTTP(S)
product link; empty rows are omitted. Codes are preserved as entered after
trimming spaces. Unsafe links, duplicate identities/codes and oversized inputs
require review before saving. Pasting a link never downloads the product page or
reads an account price.

Use as preferred swaps the chosen reference with the current preferred one,
keeping the old code/link available. Buying and selling allowances remain unchanged
and need review for the chosen supplier, VAT and pack size. Saving an edit uses the
existing durable write/retry workflow. Removing a row in an open form changes only
the draft until Save.

Search and the supplier filter include additional references. Each saved product
card has Other wholesalers with per-reference Open product, Copy code, Copy link
and Share actions. Every share contains product identity only, with current
account/record checks. Existing saved quote and purchase-list snapshots are not
rewritten when a preferred supplier changes. These optional product fields use
the existing record payload; hosted role projections may expose only the existing
preferred fields to field accounts until their separate projection is upgraded.

## Price and privacy rules

- A pack line's optional `unitCost` is a saved buying allowance. If absent on a
  legacy line, a uniquely linked material's library cost is used. Missing or
  ambiguous costs are incomplete, never silently zero.
- Quantities and buying/selling amounts are editable. The guide total adds
  labour, materials selling allowances and itemised Other charges before VAT.
  Confirm whether buying prices include irrecoverable VAT and use saved quote VAT
  settings; the catalogue does not assume the business is VAT registered.
- Quote import preserves the reviewed pack selling prices and saved buying
  allowances even if library prices changed. Labour is a fixed selling line with
  estimated hours retained internally. Actual labour cost still requires review.
- Quote-to-pack saving retains material cost snapshots and recorded labour hours.
  If exact labour hours are unavailable, an explicitly labelled internal 1h
  placeholder preserves the fixed labour amount until the pack is reviewed.
- Enter a reusable expense such as a parking permit under **Other charges**.
  Its section (Travel, Parking, Plant Hire, Contingency or Other), description,
  quantity, selling price and any recorded buying cost carry through **Save as
  job pack** and **Add pack to quote**. Check quote-level
  travel, parking and contingency separately each time. Enter each charge once.
- Some older packs list charges under **Other allowances from original quote**
  in Notes. Before reusing one, open it in Job Packs, check each entry against
  the original quote, add or confirm its priced line under Other charges, then
  remove the old heading and list from Notes and save. Keep any unrelated scope
  and exclusions. JR OS does not guess amounts from the text.
  Older saves omitted named Parking, Travel, Plant Hire and Contingency lines
  entirely. Compare older quote-derived packs with their original quotes for
  these charges, even if there is no heading in Notes.
- `notes` contains customer-copyable scope/exclusions. `internalNotes` contains
  private pricing references and assumptions and is never copied into quote scope.
- Copy code, Copy link and Share include only product name, supplier, stock code
  and a validated HTTP(S) URL. No buying cost, selling price, margin, private notes
  or customer/job details enter sharing payloads. Sharing opens only on a tap and
  does not send to a recipient automatically.

Account/session/readiness changes invalidate import/editor/sharing controls.
Imports and pack edits require office/local access. Material sharing also supports
authorized electricians without exposing the office price branches.

## AI-assisted estimates

Suggestions prefer relevant recorded work, then ranked packs, then library
matches. Broad categories such as Domestic are not enough to match a pack or
successful historical job. Included work is separated from Questions to confirm
and Exclusions, including the headings produced by the reviewed connected-AI
scope. Common electrical wording such as fusebox can match consumer-unit work;
diagnostic symptoms remain separate from confirmed installation work.

Labour calculations follow the saved rate's unit, including Hour, Day, Half day,
Call-out and Minimum charge, rather than guessing the unit from its name. A saved
hourly rate stays hourly even when a longer estimate would otherwise use days.
These calculations apply only to a new draft; saved rates and quotes are retained.

The local Quote Builder shows included work, questions, exclusions and saved-pack
match reasons separately. Point counts are review prompts: a different requested
quantity does not silently rescale a saved bill of materials. This uses saved
records and defaults without API credit. The separate live photo/recording scope
workflow still needs its configured funded connection; no additional saved
supplier/price/customer data is sent to that service by these improvements.

Each material keeps one source allowance. To use a pack's complete schedule
directly, add that pack in Quotes.

AI Materials Assistant and the local priced-draft builder preserve a suggested
pack line's exact quantity and saved buying/selling allowances. Library fallback
suggestions do not average a pack quantity down or reprice a reviewed pack. Legacy
pack costs use a uniquely linked library record; an invalid explicit pack cost
remains unknown. Duplicate pack identities cannot be selected.

Both screens expose editable costs and their source: saved pack allowance,
materials library, recorded quote cost or an amount entered for this estimate.
Blank costs are unknown; explicit zero is allowed. Missing costs and invalid
quantities/prices prevent saving, and incomplete quote costs withhold profit
figures. Purchase-list and quote creation use durable record writes; a storage
failure leaves the draft available to retry.

Each explicit generation saves at most one quote or purchase list during that
page visit. Repeated taps and retained actions cannot create another record.
A successful save closes the unsaved pricing editor and links to the exact saved
record. Generate again only to start a separate quote or list. Unchanged failed
attempts retain the same record/line identities and payload on retry; edited
failed drafts retain the record identity and rebuild their reviewed amounts.

If a write succeeded but its acknowledgement was lost, retry recognises only
one exactly matching saved record. It links to that saved version and explicitly
says later draft edits were not saved. Changed or duplicate saved identities
block recovery. Account/session changes, unmounting and old render callbacks
cannot submit a draft. Readiness refreshes require the current Save action.
This does not provide cross-device or page-reload draft recovery: leaving the
page still loses an unsaved review. Local save/queued sync is distinct from
confirmed cloud sync.

Materials Library creation, editing, quick price updates, favourites and deletion
use durable record writes. Failed form/price saves retain the entered details;
unchanged retries retain record and price-history identities. Exact saved-version
recovery avoids duplicate history and explicitly warns when later edits were not
applied. Updated records are checked again inside the durable updater, including
failed/conflicting sync; pending and offline saves remain usable.

Blank buying/selling prices require review instead of becoming zero. Explicit
zero is allowed, and full-form decimal allowances are retained without rounding.
Quick update calculates the selling price to two decimal places and records a
manual price check. Financial editing remains office/local only; field product
sharing does not grant catalogue write permission.

Material drafts survive temporary same-account identity refreshes, including
returning from a supplier tab. Changes are disabled while account data loads.
Confirmed account/role changes and session-ownership changes clear drafts;
leaving or reloading the page still loses unsaved edits. Success messages confirm
a save on this device, not completed cloud sync.

Saved Job Packs support words in any order across name, category, scope and
material descriptions, with a saved-category filter and eight cards at a time.
Materials combine product/stock-code search with category, supplier and favourite
filters, showing twelve cards at a time. Both show matching/visible totals, clear
filters and Show more. Quick material price edits remain above the results when
filters hide their original card. Ambiguous material records remain read-only
and are excluded from summary totals.

Office supplier lookups retain the chosen supplier/code on cancel or timeout,
discard results when inputs or account ownership change, and reject mismatched
or unsafe responses. Only a supplier code match can open an imported draft;
suggestions link to supplier search for manual review. Importing cannot replace
an unfinished material or quick price edit. Public prices are reference values:
buying/selling inputs stay blank until reviewed for account price, VAT and pack
size. Missing/malformed, nonexact and stated non-GBP prices are not imported as
price references; field lookups still omit all prices.

Historical material cost averages use only explicit costs saved on quote lines
or job quote snapshots, including zero. Missing costs do not count as samples,
and current library prices never backfill historical costs. These figures are
recorded quote allowances, not verified actual buying spend. Learning memory
signatures invalidate older cost summaries without a database/schema change.

On a phone, also generate an AI materials suggestion and a priced draft. Clear
one buying cost, confirm the review prompt and disabled save, then enter the
reviewed allowance and verify it reaches the saved purchase list or quote.

## Phone acceptance still required

Automated tests cover quantities/totals, invalid values, incomplete costs,
non-overwriting imports, partial failures/retries, account changes, retained
callbacks, internal-note separation, quote round-trips and native-share fallbacks.

Before everyday live use, check on Jake's actual iPhone/Android and installed app:

- Import once, edit a pack, refresh and confirm Cloud sync.
- Paste a real supplier code/link, copy both and verify the pasted result.
- Search using words in a different order, combine catalogue filters and Show
  more, then confirm an unfinished quick price edit stays accessible.
- Cancel a supplier lookup and retry; confirm exact product details and enter
  reviewed buying/selling prices before saving the resulting material draft.
- Share the product, cancel, and test denied clipboard permission/selectable text.
- Compare one real small job and one surveyed rewire quote against the reviewed
  pack, buying basket, labour cost, overheads and VAT settings.
- Switch accounts with an editor or sharing result open and confirm old actions
  cannot affect the new workspace.

This change does not activate the separate hosted AI connection, alter database
schemas or merge the development app into production.
