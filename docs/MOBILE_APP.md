# JR OS on a phone

JR OS can be installed from its normal HTTPS address as a home-screen app. It
opens in a standalone window and uses the existing role-aware mobile workspaces.

The phone header keeps workspace and account access above the page content. The
bottom tabs remain within thumb reach, with an Account tab when cloud sign-in is
required. Sync status appears only after account checks succeed; signed-out users
see Sign in. Header, content and shared action bars respect the phone's safe areas
in portrait and landscape. Page zoom remains enabled.

## Install

- **iPhone/iPad:** open the normal JR OS address in Safari, tap **Share → Add to
  Home Screen**, keep **Open as Web App** enabled if shown, then tap **Add**.
- **Android:** open the normal JR OS address in Chrome, open its menu and choose
  **Install app** or **Add to Home screen**, then confirm.

The account page and workspace menu include these instructions. They are hidden
when JR OS is running in standalone or fullscreen display mode. Install the
normal app address; temporary pull-request previews are separate installations.

Sign in with the same account in the installed app. Some platforms isolate its
storage from the browser. Keep the original browser until records are synced or
backed up; installation does not copy device-local records or pending writes.
Cloud authentication and synchronization still require connectivity and an
active Supabase project.

## Implementation

`app/manifest.ts` supplies a stable app ID, root scope, standalone display mode,
and PNG icons for installation. The icons and favicon derive from `app/icon.svg`,
using the existing cyan JR OS lightning mark. The square opaque background and
centred mark support Android icon masks. Apple touch metadata uses the 180px PNG.

`/app` is a neutral launch route. It waits for identity resolution, then replaces
the route with the office dashboard, field workspace, customer portal or sign-in
page. The normal access guard still authorizes the destination. Launching does
not read business collections, persist account identity or accept a redirect URL.

There is no service worker or new response cache. Home-screen installation does
not imply that a cold launch works offline. Existing repository-level caches and
queues retain their current authorization boundaries; private document links,
payment links and authentication responses are not cached by this feature.

## Verification

Run `npm test`, `npm run lint`, `npm run build`, `npx tsc --noEmit`, and
`npm audit --audit-level=moderate`. The installation tests check actual icon
dimensions, manifest requirements, role-aware launch, signed-out behavior and
the launch route's exact authorization exception.

On an HTTPS preview, verify `/manifest.webmanifest`, both installation icons,
the Apple touch icon, and the account/menu installation instructions. Before a
production release, check installation and relaunch on iPhone and Android,
including signed-out, office, field and customer accounts. Do not change
Supabase configuration or switch cloud mode merely to test installation.
