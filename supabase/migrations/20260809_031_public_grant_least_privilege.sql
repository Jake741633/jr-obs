-- Supabase's legacy default privileges grant new public objects broadly to
-- anon, authenticated and service_role. RLS remains the row boundary, but
-- object grants should be explicit so a future table cannot become reachable
-- before its intended policy and API contract are defined.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

-- Anonymous clients use Supabase Auth endpoints only; JR OS exposes no public
-- business-data table or RPC. Keep authenticated and service API schema access.
revoke usage on schema public from public, anon;
grant usage on schema public to authenticated, service_role;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- Read-only application surfaces.
grant select on table
  public.organisations,
  public.audit_log
to authenticated;

-- Profiles are created by the Auth trigger and can only be read or updated by
-- signed-in users under profile RLS and immutable-identity guards.
grant select, update on table public.profiles to authenticated;

-- Operational tables retain only the four Data API CRUD privileges. RLS and
-- trigger guards continue to enforce tenant, role, actor and identity checks.
grant select, insert, update, delete on table
  public.ai_recommendation_evidence,
  public.app_records,
  public.builders,
  public.certificates,
  public.cloud_collections,
  public.customers,
  public.electrical_testing_records,
  public.expenses,
  public.invoices,
  public.job_documents,
  public.jobs,
  public.materials,
  public.migration_markers,
  public.payments,
  public.planner_entries,
  public.portal_approvals,
  public.portal_requests,
  public.pricing_documents,
  public.private_files,
  public.purchase_lists,
  public.stock_items,
  public.stock_movements,
  public.team_members,
  public.timesheets
to authenticated;

notify pgrst, 'reload schema';
