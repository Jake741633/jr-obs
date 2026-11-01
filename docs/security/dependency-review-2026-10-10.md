# Dependency maintenance — 10 October 2026

The previous lockfile reported 18 vulnerable packages (2 critical, 13 high,
3 moderate) in the fresh npm audit. Severity describes the upstream packages;
it does not establish that every advisory is exploitable through this app.

- Update Next.js from 16.3.4 to 16.3.8. Keep the existing eslint-config-next
  version and rules; its affected glob dependency is handled separately below.
- Remove the unused shadcn generator dependency. The generated UI components
  remain in the repository and keep their existing runtime dependencies.
- Refresh affected transitive dependencies within their supported ranges.
- Replace only `@next/eslint-plugin-next`'s `fast-glob` dependency with the pinned
  npm alias `tinyglobby@0.2.17`. Upstream braces 3.0.3 has an unpatched recursive
  pattern vulnerability; downgrading Next lint or ignoring the advisory would
  leave that problem unresolved.

The Next lint plugin calls only `globSync(pattern, { onlyDirectories: true })`
from this dependency, in its root-directory helper. tinyglobby supports that
interface. The override is scoped to that caller; it is not a claim of complete
fast-glob API compatibility. For absolute patterns tinyglobby returns cwd-relative
paths; Next's filesystem checks resolve these to the same directories.
`tests/next-eslint-root-glob.test.mjs` executes the
actual plugin helper with directory, wildcard, brace, array, missing-directory
and Windows-separator inputs, and verifies that the actual Next page-link rule
still reports a violation through the real ESLint configuration. No lint rule,
audit threshold or CI gate is disabled. Revisit the override when upstream
removes or patches the vulnerable dependency.

Primary references:

- https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/vercel/next.js/blob/v16.2.9/packages/eslint-plugin-next/src/utils/get-root-dirs.ts
- https://github.com/SuperchupuDev/tinyglobby

This maintenance change does not authorise a production database migration or
replace the outstanding recovery and physical-device release evidence.
