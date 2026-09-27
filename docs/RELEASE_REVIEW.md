# Operator release review

`/release-readiness` records manual review confirmations. It does not execute
checks, verify a deployment, grant production migration authorisation or change
the configured cloud mode. Access remains restricted to configured owner
operators through the existing navigation and workspace guards.

The page derives its requirements from the current effective local, migration
or cloud mode. Cloud and migration reviews include account/sync reconciliation,
protected hosted RLS/Storage acceptance, the production backup/restore review,
upgrade rehearsal evidence and separate production migration authorisation.
Physical iPhone and Android installation/relaunch checks are separate items.
The page links to the existing account installation instructions and committed
recovery/rehearsal reports.

## Persisted evidence

The existing `jr-os-release-readiness-v0-1` collection and account/tenant storage
boundaries are retained; no migration or new cloud collection is needed.
Displayed requirements always come from `lib/releaseReadiness.ts`, never from
saved titles or descriptions. A confirmation stores its stable check ID,
completion flag, review time and exact requirement key. The key includes the
requirements version, mode, ID, title and detail.

Old v0.1 completion flags lack this evidence and appear unconfirmed. Changing a
requirement's wording, its version or the operating mode invalidates the
affected confirmation. Duplicate or malformed evidence cannot confirm a check.
Loading the page does not automatically rewrite stored records; toggling a check
replaces only that check's evidence. Reset clears the checklist confirmations.

Confirmations are manual evidence for the operator's intended release candidate,
not a signed audit log or an automated binding to a deployment SHA. Reset them
when reviewing a different release. All items being ticked means only that the
review was recorded. Keep actual dumps, credentials, Auth records and protected
restore evidence outside the checklist and repository.

## Verification

`tests/release-readiness.test.mjs` exercises legacy evidence, wording and mode
changes, valid restores, duplicate/malformed records and rendered-page toggling,
reset and identity-loading behaviour. Existing operator-access and phone-app
tests retain the access and installation boundaries. Run the full application
tests, lint, production build and TypeScript checks before merging.

Physical-device acceptance and a real production backup restore remain external
release gates; synthetic tests and manually ticking this checklist do not
satisfy them.
