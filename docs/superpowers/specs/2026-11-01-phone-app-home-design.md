# JR OS phone home and navigation

Jake wants larger icons, quicker daily navigation and an app-like experience on his phone. Build on the existing Next.js installable app and JR OS navy/cyan branding. Existing autonomous implementation and development-preview authorisation applies; production release and database changes remain separate.

## Approach

Use the existing application shell and guarded routes. A native rebuild would duplicate the working business workflows; icon sizing alone would leave the long dashboard in the way. The chosen implementation is a focused phone launcher with the full business overview available on demand. This is an implementation choice within the requested mobile redesign.

## Behaviour

- Under 1024px, Home immediately shows six large, labelled shortcuts: Jobs, Quotes, Customers, Planner, Materials and Invoices. JR AI and All tools are directly available. Quotes opens the existing quick-quote workspace, which has its own New quick draft action.
- The full Command Centre is behind a native Business overview disclosure. Its collections mount only when opened. Desktop keeps its existing Command Centre.
- Bottom navigation keeps its existing five office destinations and role-specific field/customer/sign-in behaviour, with larger icons and clear selected states.
- Quick actions and More use large recognisable icons. More keeps its existing permission-filtered search, daily destinations and install help; the complete tool groups become collapsible.
- Keep page zoom, keyboard access, visible focus, sync warnings, safe-area padding and action-dock clearance. Use the existing home-screen installation path.
- No business-data mutations, storage changes, new dependencies or new account permissions.

## Acceptance

Verify actual phone-width layouts at 320, 390 and 430px, large icon targets, all six shortcut destinations, overview open/close and desktop presentation. Verify More search and empty state, section disclosure, Quick actions close/navigation and bottom-tab current state. Run existing role/navigation regressions, full tests, lint and production build. Physical iPhone installed-app testing remains separate from browser verification.
