# JR OS Roadmap

## Vision
Build JR OS into the operating system for JR Electrical Services, capable of supporting a solo electrician today and a £1m+ electrical company in the future.

## Current delivery track — October 2026

These features are delivered on the `jr-os-v2` preview track. Production release
acceptance is tracked separately in [Release Review](docs/RELEASE_REVIEW.md).

- [x] Electrical catalogue with 40 editable job packs and 101 materials, separated buying/selling allowances and clearly labelled historical benchmarks
- [x] Reviewed, non-overwriting catalogue imports with partial-save retries; durable pack editing and quote price/cost/hour preservation
- [x] Phone-friendly supplier code/link paste, copy and native sharing with product-only payloads and safe fallbacks
- [x] AI suggestions retain pack allowances, distinguish missing costs from zero, and require complete cost review before saving quotes or purchase lists; historical cost samples use recorded quote allowances
- [x] AI quote/list saves prevent repeated-tap duplicates, retain retry identities, recover exact saved versions and link directly to the saved record
- [x] Durable Materials Library forms and price updates with retained failed drafts, exact retry recovery, changed-record review and account/sync guards
- [x] Phone catalogue browsing with multiword search, category/supplier filters and progressive cards; quick material price drafts stay visible while filtering
- [x] Reviewed exact supplier imports with cancellation, timeout, stale-response guards and public-price references kept separate from buying/selling allowances
- [ ] Physical-phone acceptance of catalogue import/sync, real supplier sharing and real-job pricing comparison before everyday live use
- [x] Saved calculation evidence linked to jobs, quotes, estimates and surveys
- [x] Home-screen web app foundation with role-aware launch and installation help
- [x] Phone quick actions and direct JR AI navigation
- [x] Evidence-backed daily priorities connecting money, quotes, site readiness and diary clashes
- [x] Correct draft-invoice and scheduled-follow-up false alerts
- [x] Connect assistant and dashboard balances to the payment ledger without double-counting
- [x] One-tap assistant answers for diary, money, quote follow-ups and site preparation
- [x] Task-aware JR AI priorities and open-task/snag answers linked to the exact record
- [x] Task source-identity review with incomplete-count warnings, live exact-link checks and guarded phone actions
- [x] One-tap job-to-JR-AI briefing links with exact saved identity and invalid-link handling
- [x] Job-specific JR AI briefing joining tasks, visits, materials, quote links and payment-aware billing
- [x] JR AI next-work-visit checks with named-job questions, phone scope and uncertain-booking evidence
- [x] Ask for tasks/snags on a named job or site, with a phone job selector and explicit duplicate choices
- [x] Phone task inbox with job/search/status filters and progressive loading
- [x] Retain failed task drafts and retry creation notes without duplicating saved tasks
- [x] Phone task status controls show only valid next stages and distinguish current/blocked actions
- [x] Confirm task status saves and deletion before success, with separate timeline retries
- [x] Open the requested diary day and retain multi-day visits across calendar views
- [x] Correct week/month boundaries, local phone dates and monthly booking repeats
- [x] Durable new diary bookings with stable recurring-series retries and explicit partial saves
- [x] Durable diary moves and visit confirmation without resetting later or closed job stages
- [x] Phone next-visit planning that separates ongoing/future work bookings from history and uncertain records
- [x] Evidence-based diary clash signals and separate phone review of uncertain dates, times and statuses
- [x] Phone diary search, status/job filters and progressive visit cards with exact job-scoped JR AI scheduling links
- [x] JR AI material-ordering and delivery-follow-up answers with exact job scope and purchase-list review links
- [x] JR AI source-identity review for ambiguous jobs, purchase lists and lines without inflated status counts
- [x] JR AI invoice/payment evidence checks with withheld ambiguous balances and explicit incomplete totals
- [x] Exact saved-invoice review links with phone search, saved-status filters and progressive cards
- [x] Phone quote inbox with type/status filters, site search, progressive cards and expandable overview
- [x] JR AI quote-source checks with uncertain-date reviews, withheld follow-up counts and job-scoped evidence
- [x] Explicit job-specific unpaid/overdue invoice and quote-follow-up answers with retained identity and compact phone shortcuts
- [x] Phone Jobs inbox with active/closed/stage review filters, multiword search, progressive cards and exact job-to-JR-AI links
- [x] Durable job forms with retained failed drafts, changed-record checks, separate timeline retries and confirmed deletion
- [x] Durable quick job-stage changes with live account/source guards, fresh conflict checks and server-authored field history
- [x] Phone customer inbox with multiword/contact search, progressive cards and direct call/email actions
- [x] Durable customer forms with retained drafts, changed-record review, stable retries and guarded linked-job deletion
- [x] Reviewed phone contacts: native picker where available, iPhone vCard-file import, editable choices, duplicate review and durable partial-save retries
- [x] Job evidence capture from camera/photo library with optimised copies, video links and clearly attributed user-entered spoken notes
- [x] Reviewed job photo batches with shared notes, sequential preparation, per-photo progress and partial-save retries without duplicating completed evidence
- [x] Searchable job evidence with photo/document filters, progressive records and expandable private photo previews for office/local use
- [x] Reuse a reviewed saved job photo and notes in Quote Builder, with explicit sharing, current-source checks and notes-only use of video-link records
- [ ] Direct large video-file uploads with durable private binary storage and progress/retry controls
- [x] Connected photo/notes quote-scope implementation with live account guards, explicit sharing, editable human review and clear billing errors; hosted activation and live generation acceptance remain below
- [ ] Activate the server-side AI secret/business allowlist on the development preview and verify a funded live generation request (local key authenticates; API credit exhausted)
- [x] Short site-video/voice preparation, reviewed speech transcription and sampled-frame quote scope; local preparation and server boundaries implemented with explicit sharing (hosted activation, funded live checks and physical-phone acceptance remain pending)
- [x] Phone customer profiles with section shortcuts, progressive linked records, searchable activity and exact job-to-JR-AI links
- [x] Explicit customer-profile job completion with durable saves and separate history-note retries
- [x] Editable review-request preparation with user-confirmed sent records and durable partial-save retries
- [x] Phone follow-up queue with multiword/contact search, progressive cards, filtered recommendations and validated contact links
- [x] Durable follow-up rules with retained edits, numeric validation, changed-record review and account/conflict guards
- [x] Future lead follow-up dates suppress premature resurfacing in the contact queue
- [x] Durable follow-up contact logging and postponement with explicit contact channel and partial-history retries
- [x] Phone lead browsing with progressive cards, multiword/contact search, exact-record deep links and withheld ambiguous identities
- [x] Durable lead capture and reviewed stage changes with retained failure drafts and independent history retries
- [x] Durable lead activity/outcome saves and guarded deletion with retained failure drafts and reviewed history cleanup
- [x] Lead follow-up age uses genuine contact evidence and labels enquiry-date fallbacks without treating notes as contact
- [x] Pipeline source review with explicit saved-stage corrections, exact known value subtotals and incomplete count/rate labels
- [x] Follow-up lead review for ambiguous identities, unrecognised stages and invalid dates, with unknown value/priority evidence kept out of ranking boosts
- [x] Job-aware JR AI follow-up questions and one-tap related answers retaining the exact saved job
- [x] Compact phone question panel with question-first layout and expandable shortcuts/scope help
- [x] Durable purchase-list creation with retained selections, stable retry identities and repeated-tap protection
- [x] Phone purchase-line drafts with explicit durable saves, conflict review and confirmed list deletion
- [x] Phone purchase search, exact job/status filters, uncertain-record review and progressive list cards
- [x] Reviewed low-stock requests with durable saves, stable retries and changed-source checks
- [x] Phone stock-code choices by saved identity and location, with stale-selection checks and progressive results
- [x] Phone supplier lookup with labelled controls, cancellation, retry and stale-response protection
- [x] Check each upcoming visit’s readiness and open the affected diary day
- [ ] Physical iPhone/Android install, relaunch, keyboard and signed-in workflow acceptance
- [ ] Production recovery evidence and release sign-off
- [x] Manufacturer-evidence device-pair coordination with saved backup and selectivity comparisons
- [ ] Maintained manufacturer catalogue and automatic device selection in Electrical Calculators

Implementation and checks: [Phone app](docs/MOBILE_APP.md),
[Daily Assistant](docs/AI_DAILY_ASSISTANT.md),
[Electrical Calculators](docs/ELECTRICAL_CALCULATORS.md).
The version lists below retain the original planning baseline.

## v0.1 Foundation
- [x] Next.js app created
- [x] GitHub connected
- [x] Dashboard created
- [x] Sidebar layout created
- [x] Customers page created

## v0.2 App Structure
- [ ] Create shared layout
- [ ] Create reusable sidebar component
- [ ] Create dashboard cards
- [ ] Add working navigation links
- [ ] Add mobile responsive layout

## v0.3 CRM
- [ ] Customer list
- [ ] Add customer form
- [ ] Customer detail page
- [ ] Builder list
- [ ] Builder detail page
- [ ] Customer notes
- [ ] Job history

## v0.4 Quotes & Estimates
- [ ] New quote form
- [ ] Estimate/quote toggle
- [ ] Labour pricing
- [ ] Materials pricing
- [ ] Per-job markup
- [ ] Hidden supplier discounts
- [ ] Quote PDF export

## v0.5 Jobs
- [ ] Job board
- [ ] Job status tracking
- [ ] Calendar
- [ ] Electrician job view
- [ ] Office job view
- [ ] Builder job view

## v0.6 Surveys
- [ ] Office call checklist
- [ ] Electrical installation checklist
- [ ] Electrician site survey form
- [ ] Photo upload
- [ ] Voice note upload
- [ ] AI survey summary

## v0.7 Materials & Job Packs
- [ ] Supplier material orders
- [ ] Upload supplier quotes/invoices
- [ ] Attach materials to jobs
- [ ] Job packs
- [ ] Stock tracking
- [ ] Returns tracking

## v0.8 Permissions
- [ ] Owner role
- [ ] Office role
- [ ] Electrician role
- [ ] Apprentice role
- [ ] Builder portal role
- [ ] Customer portal role
- [ ] Owner Lock for pricing/profit

## v0.9 AI Foundation
- [ ] AI Estimator
- [ ] AI Office Assistant
- [ ] AI Site Supervisor
- [ ] AI Business Coach
- [ ] AI CEO
- [ ] Company Brain

## v1.0 First Usable Release
- [ ] Login
- [ ] Customers
- [ ] Jobs
- [ ] Quotes
- [ ] Invoices
- [ ] Materials
- [ ] Surveys
- [ ] Permissions
- [ ] Basic AI assistance

## Long Term
- [ ] Leave PAYE tracker
- [ ] £1m growth dashboard
- [ ] Staff management
- [ ] Van management
- [ ] Tool tracking
- [ ] Payroll exports
- [ ] Customer portal
- [ ] Builder portal
- [ ] Mobile app/PWA
- [ ] SaaS version for other contractors
