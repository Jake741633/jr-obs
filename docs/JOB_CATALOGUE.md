# Electrical job catalogue

## Approved scope

The catalogue contains 40 editable electrical job packs and 101 generic materials,
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
   fields. Generic starters intentionally have no fabricated codes or URLs.
5. Add the pack in Quotes, review the actual job and costs, and check VAT settings
   before sending. Importing the catalogue never sends quotes or places orders.

Imports are optional and add missing IDs only. Existing starter records and user
edits are preserved, including the original 70 materials and 20 packs. Importing
does not upgrade an existing starter with newer template values. Edit that saved
record manually when you want to change it. Material records save before packs.
If saving fails partway, completed records remain and a retry adds only missing
records. Local persistence/queued sync is not claimed as confirmed cloud sync.

## Price and privacy rules

- A pack line's optional `unitCost` is a saved buying allowance. If absent on a
  legacy line, a uniquely linked material's library cost is used. Missing or
  ambiguous costs are incomplete, never silently zero.
- Quantities and buying/selling amounts are editable. The guide total is labour
  plus materials selling allowances, not buying cost. No VAT is added here.
  Confirm whether buying prices include irrecoverable VAT and use saved quote VAT
  settings; the catalogue does not assume the business is VAT registered.
- Quote import preserves the reviewed pack selling prices and saved buying
  allowances even if library prices changed. Labour is a fixed selling line with
  estimated hours retained internally. Actual labour cost still requires review.
- Quote-to-pack saving retains material cost snapshots and recorded labour hours.
  If exact labour hours are unavailable, an explicitly labelled internal 1h
  placeholder preserves the fixed labour amount until the pack is reviewed.
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
matches. Each material keeps one source allowance. To use a pack's complete
schedule directly, add that pack in Quotes.

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
- Share the product, cancel, and test denied clipboard permission/selectable text.
- Compare one real small job and one surveyed rewire quote against the reviewed
  pack, buying basket, labour cost, overheads and VAT settings.
- Switch accounts with an editor or sharing result open and confirm old actions
  cannot affect the new workspace.

This change does not activate the separate hosted AI connection, alter database
schemas or merge the development app into production.
