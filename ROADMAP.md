# JR OS Roadmap

## Vision
Build JR OS into the operating system for JR Electrical Services, capable of supporting a solo electrician today and a £1m+ electrical company in the future.

## Current delivery track — October 2026

These features are delivered on the `jr-os-v2` preview track. Production release
acceptance is tracked separately in [Release Review](docs/RELEASE_REVIEW.md).

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
- [x] Phone customer profiles with section shortcuts, progressive linked records, searchable activity and exact job-to-JR-AI links
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
