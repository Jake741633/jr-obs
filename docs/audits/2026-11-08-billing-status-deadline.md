# A11 — billing status recovery deadline

Audit checkpoint: `bc6a9e5ca065bfa37b7f4874ae238719fa2058b1`, inactive subscription foundation PR327 on `feat/subscription-foundation-20261101`. The separate core application audit is on `fix/jr-os-audit-20261108` against `jr-os-v2` and records the full findings.

A native-loopback response returning headers but stalled JSON kept the billing screen loading indefinitely and disabled Refresh. The status client now creates one 20,000 ms deadline spanning fetch and the complete response body. It forwards caller cancellation, returns `unavailable` on its own timeout and `null` for a cancelled or retired owner. Cleanup clears the timer, removes the caller listener and aborts any unread transport body. The public request/function contract is unchanged.

Five regressions failed before the correction; all 35 focused billing status/action/page/panel tests pass afterward. Tests use native fetch with synthetic loopback servers, controlled test timers and no Stripe, Auth or hosted requests. They cover stalled headers, a started but unfinished JSON body, caller cancellation, account retirement, cleanup, an enabled Refresh action after timeout and successful retry without navigation. A held-status page fixture now honors AbortSignal rather than leaving an abandoned promise alive until the new deadline.

Final local verification: all 3,059 root tests, zero-warning ESLint and the production build pass. Root independently reviewed the small client change and its actual-page/native-transport regressions after the implementation worker. Remote exact-head CI, dependency review and preview evidence belongs in PR327 after publication; this document is saved before those jobs start.

All billing activation flags remain unchanged/off. The prepared migration remains unapplied and PR327 stays draft/unmerged. No credential, hosted schema/configuration/account, provider, charge/refund/subscription/email/tax or real-user mutation occurred. Current-provider reconciliation and commercial/physical-device acceptance remain separate launch requirements.
