# JR OS Supabase setup

JR OS remains usable with browser local storage when Supabase is not configured. Do not switch to cloud mode until the SQL migrations, authentication users and Row Level Security checks have been completed.

## 1. Create the Supabase project

1. Create a Supabase project in the region appropriate for the business.
2. Enable email/password authentication.
3. Configure the production Site URL and redirect URLs in Authentication settings.
4. Keep email confirmation enabled for real users unless a controlled onboarding flow is used.
5. Do not place the service-role key, database password or JWT secret in browser or Netlify public environment variables.

## 2. Run the SQL

Run these files in order in the Supabase SQL editor:

1. `supabase/schema.sql`
2. `supabase/migrations/20260730_001_cloud_foundation.sql`
3. `supabase/migrations/20260730_002_audit_triggers.sql`

The first file creates the original organisations, profiles and legacy app-record backup. The migrations extend that same tenant model with typed entity tables, version fields, audit logging, private file metadata and customer-scoped RLS.

## 3. Configure environment variables

Copy `.env.example` to `.env.local` for local development and add the same public values in Netlify:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
NEXT_PUBLIC_JR_OS_CLOUD_MODE=local
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=jr-os-private
```

Only the project URL and public anon key may use `NEXT_PUBLIC_`. RLS is the security boundary for browser requests.

## 4. Create the owner account

Create the first account from `/cloud` or Supabase Authentication. The existing signup trigger creates an organisation and owner profile. Confirm the profile has:

- the correct `organisation_id`
- role `owner`
- `active = true`

Before inviting anyone else, confirm the owner can see only their organisation.

## 5. Add staff and portal users

Create Auth users and profiles linked to the same organisation. Supported roles are:

- `owner`: all application and tenant administration
- `admin`: all application and tenant administration
- `office`: office, finance, customer and scheduling records
- `electrician`: field, job, planner, materials, testing and certificate records
- `customer`: only customer-scoped portal records

For a customer portal user, set `profiles.customer_source_id` to the stable JR OS customer record ID. Customer RLS uses that value to restrict records.

Profile and permission changes are audit logged by database trigger.

## 6. Verify RLS before storing real data

Use separate test users for owner, office, electrician and customer. Verify:

- users cannot query another organisation by changing REST filters
- customers cannot read records with a different `customer_source_id`
- electricians cannot query office-only finance, CRM history, settings or AI records directly
- electricians cannot read full pricing documents, internal costs, markup or margin data through typed APIs
- only owner/admin accounts can enumerate organisation authentication profiles
- electricians cannot delete tenant records
- office users cannot manage owner/admin permissions
- only owner/admin users can delete typed records
- private storage objects cannot be opened using an unauthenticated permanent URL

Do not use real customer records until these tests pass.

## 7. Migrate local records

1. Keep `NEXT_PUBLIC_JR_OS_CLOUD_MODE=local` while configuring the project.
2. Take a normal JR OS backup.
3. Change the mode to `migration` and redeploy.
4. Sign in at `/cloud`.
5. Run **Import records to typed tables**.
6. Review imported row counts and errors.
7. Re-run the import after corrections. Stable local record IDs and `(organisation_id, source_id)` uniqueness prevent duplicate rows.
8. Leave local storage in place until cloud data, attachments and permissions have been verified.

The legacy backup button remains available as an additional recovery copy in `app_records`.

## 8. Sync modes

### Local

- existing `useLocalStorageCollection` behaviour
- no Supabase request
- existing records remain fully usable

### Migration

- local storage remains authoritative
- explicit typed imports copy records to Supabase
- authenticated cloud permissions and typed tables can be tested
- unauthenticated users may continue using the local workspace during transition

### Cloud

- cloud authentication is required for business pages
- role-based route guards and navigation apply
- local storage remains available as an offline cache/fallback foundation
- queued changes retry when connectivity returns

Do not select cloud mode until all active pages have been moved to the repository adapter and end-to-end sync tests have passed.

## 9. Conflicts and offline changes

The sync queue is stored under `jr-os-cloud-sync-queue`. Each queued update may include an expected cloud version. Before an upsert, JR OS reads the current row:

- matching version: apply the change and increment the version
- different version: mark `Conflict` and retain the queue item
- offline: mark `Offline` and retry after the browser `online` event
- request error: mark `Failed` and retain the item

Conflicts are never silently overwritten. A future conflict-resolution UI still needs to show local and cloud values side by side before the user chooses a result.

## 10. Private files

The migration creates the private `jr-os-private` bucket and tenant-path RLS policies. Object paths must begin with the organisation UUID:

```text
<organisation-id>/jobs/<job-source-id>/<generated-file-name>
```

Use authenticated upload/download requests from the data-access layer. Migration `041` deliberately denies client-created signed upload and download URLs because those bearer URLs outlive Auth session revocation. Do not save service credentials in the browser and do not change either JR OS bucket to public.

After deploying migration `041`, ask Supabase Support to rotate the project's dedicated Storage signed-URL key. Supabase documents that signed download URLs issued before the migration remain valid until their chosen expiry and cannot be revoked by rotating Auth keys. Do not mark the signed-token hardening complete until that rotation is confirmed: <https://supabase.com/docs/guides/storage/serving/downloads#signing-urls>.

## Production readiness limits

This is a migration foundation, not a completed production cutover. Before storing real customer data, complete:

- verified RLS tests for every table and role
- server-side invitation and role-management workflows
- secure password reset and account recovery
- MFA policy for owner/admin users
- session refresh and revocation testing
- conflict-resolution UI
- retry backoff and dead-letter handling
- typed cloud adapters on every business page
- attachment upload completion and malware/content validation
- backup, point-in-time recovery and retention policy
- privacy notice, retention rules and data-subject workflows
- monitoring for failed authentication, RLS denials and sync failures
- penetration/security review

Supabase service-role credentials must be used only in a protected server environment when a privileged administration workflow is later added.
