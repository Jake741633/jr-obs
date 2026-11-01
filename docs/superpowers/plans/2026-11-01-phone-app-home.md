# Phone Home and Navigation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in this session. Steps use checkbox syntax for tracking.

**Goal:** Make JR OS faster to navigate on a phone with a launcher, large icons and a shorter tool menu.

**Architecture:** Reuse guarded routes and the current PWA shell. A small responsive Home wrapper mounts either the existing desktop dashboard or a phone launcher with a lazy business-overview disclosure. A shared presentational icon component supplies consistent icons to daily links.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Lucide.

**Spec:** `docs/superpowers/specs/2026-11-01-phone-app-home-design.md`

## Global Constraints

- Existing autonomous development-preview authorisation; no production release or database changes.
- Preserve all role/account navigation boundaries, sync warnings, zoom and safe-area/dock clearance.
- No new dependencies or business-data mutations.
- Verify at 320, 390 and 430px. Preserve the full desktop Command Centre.

## Review Focus

- A closed phone overview must not mount the dashboard's business collections.
- Resizing between phone and desktop must retain a usable home view and valid disclosure state.
- Signed-out, customer and electrician accounts must keep their existing destinations.
- Long labels, narrow screens and the phone keyboard must not obstruct controls.
- Enlarged bottom icons must not overlap existing fixed action docks.

### Task 1: Phone launcher and larger navigation

**Files:** Create `components/mobile/PhoneHome.tsx` and `components/mobile/WorkspaceIcon.tsx`; modify `app/page.tsx`, `components/MobileNav.tsx` and `components/mobile/MobileQuickActions.tsx`.

**Interfaces:** `PhoneHome()` renders only navigation; `WorkspaceIcon({ href, className })` renders an existing Lucide icon. Existing route and identity APIs remain unchanged.

- [ ] Verify the clean baseline and record the existing phone layout.
- [ ] Implement the six phone shortcuts, direct JR AI and All tools access, responsive dashboard wrapper and native lazy overview.
- [ ] Increase bottom-tab and quick-action icons without changing destinations or dock offsets.
- [ ] Verify navigation/permission regressions and actual phone layouts, including closed/open overview and desktop.

### Task 2: Compact tool menu and delivery

**Files:** Modify `app/menu/page.tsx`, `docs/MOBILE_APP.md` and `ROADMAP.md`.

**Interfaces:** Reuse Task 1's `WorkspaceIcon`; retain existing filtered navigation/search arrays and install guide.

- [ ] Add large daily-tool icons and native collapsible groups to More.
- [ ] Verify search, no-result state, group open/close, keyboard access and quick-action navigation.
- [ ] Run full tests, lint and build; review the complete diff independently.
- [ ] Update documentation, push a feature PR to `jr-os-v2`, wait for CI and integrate only into the authorised preview track.

Presentation-only edits use existing regression tests and browser acceptance; do not add implementation-mirroring CSS/source tests.
