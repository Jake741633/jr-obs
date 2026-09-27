-- Prevent privilege escalation through the original self-profile update policy.
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists profiles_owner_manage on public.profiles;
create policy profiles_owner_manage on public.profiles
for update to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_business())
with check (organisation_id=public.current_organisation_id() and public.can_manage_business());

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer set search_path=public
as $$
begin
  if auth.uid()=old.id and not public.can_manage_business() then
    if new.organisation_id is distinct from old.organisation_id
      or new.role is distinct from old.role
      or new.active is distinct from old.active
      or new.customer_source_id is distinct from old.customer_source_id then
      raise exception 'Only an owner or admin can change organisation membership, role or portal scope';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_profile_privilege_escalation() from public, anon, authenticated;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

-- The legacy aggregate backup is retained for transition, but customers and electricians cannot rewrite it.
drop policy if exists "Members can create organisation records" on public.app_records;
drop policy if exists "Members can update organisation records" on public.app_records;
drop policy if exists "Owners and office can delete records" on public.app_records;
drop policy if exists app_records_office_insert on public.app_records;
drop policy if exists app_records_office_update on public.app_records;
drop policy if exists app_records_admin_delete on public.app_records;
create policy app_records_office_insert on public.app_records
for insert to authenticated
with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data() and created_by=auth.uid());
create policy app_records_office_update on public.app_records
for update to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_office_data())
with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data() and updated_by=auth.uid());
create policy app_records_admin_delete on public.app_records
for delete to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_business());

-- Replace generic typed-table write policies with role-specific policies.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','builders','pricing_documents','invoices','payments','expenses','team_members','ai_recommendation_evidence'
  ] loop
    execute format('drop policy if exists %I on public.%I',t||'_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_update',t);
    execute format('drop policy if exists %I on public.%I',t||'_office_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_office_update',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data())',t||'_office_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_office_data()) with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data())',t||'_office_update',t);
  end loop;

  foreach t in array array[
    'jobs','materials','stock_items','stock_movements','purchase_lists','planner_entries','timesheets','certificates','electrical_testing_records','job_documents'
  ] loop
    execute format('drop policy if exists %I on public.%I',t||'_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_update',t);
    execute format('drop policy if exists %I on public.%I',t||'_field_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_field_update',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organisation_id=public.current_organisation_id() and public.can_manage_field_data())',t||'_field_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (organisation_id=public.current_organisation_id() and public.can_manage_field_data()) with check (organisation_id=public.current_organisation_id() and public.can_manage_field_data())',t||'_field_update',t);
  end loop;
end $$;

-- Portal users can submit only records scoped to their own stable customer source ID.
drop policy if exists portal_approvals_insert on public.portal_approvals;
drop policy if exists portal_approvals_update on public.portal_approvals;
drop policy if exists portal_requests_insert on public.portal_requests;
drop policy if exists portal_requests_update on public.portal_requests;
drop policy if exists portal_approvals_staff_insert on public.portal_approvals;
drop policy if exists portal_approvals_staff_update on public.portal_approvals;
drop policy if exists portal_approvals_customer_insert on public.portal_approvals;
drop policy if exists portal_requests_staff_insert on public.portal_requests;
drop policy if exists portal_requests_staff_update on public.portal_requests;
drop policy if exists portal_requests_customer_insert on public.portal_requests;

create policy portal_approvals_staff_insert on public.portal_approvals
for insert to authenticated
with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data());
create policy portal_approvals_staff_update on public.portal_approvals
for update to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_office_data())
with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data());
create policy portal_approvals_customer_insert on public.portal_approvals
for insert to authenticated
with check (
  organisation_id=public.current_organisation_id()
  and public.current_role()='customer'
  and customer_source_id=(select customer_source_id from public.profiles where id=auth.uid())
);

create policy portal_requests_staff_insert on public.portal_requests
for insert to authenticated
with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data());
create policy portal_requests_staff_update on public.portal_requests
for update to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_office_data())
with check (organisation_id=public.current_organisation_id() and public.can_manage_office_data());
create policy portal_requests_customer_insert on public.portal_requests
for insert to authenticated
with check (
  organisation_id=public.current_organisation_id()
  and public.current_role()='customer'
  and customer_source_id=(select customer_source_id from public.profiles where id=auth.uid())
);

-- Restrict legacy storage bucket writes to authenticated staff. New files should use jr-os-private.
drop policy if exists "Members can upload organisation files" on storage.objects;
drop policy if exists "Members can update organisation files" on storage.objects;
drop policy if exists "Owners and office can delete organisation files" on storage.objects;
drop policy if exists legacy_files_staff_insert on storage.objects;
drop policy if exists legacy_files_staff_update on storage.objects;
drop policy if exists legacy_files_admin_delete on storage.objects;
create policy legacy_files_staff_insert on storage.objects
for insert to authenticated
with check (bucket_id='jr-os-files' and (storage.foldername(name))[1]=public.current_organisation_id()::text and public.can_manage_field_data());
create policy legacy_files_staff_update on storage.objects
for update to authenticated
using (bucket_id='jr-os-files' and (storage.foldername(name))[1]=public.current_organisation_id()::text and public.can_manage_field_data());
create policy legacy_files_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='jr-os-files' and (storage.foldername(name))[1]=public.current_organisation_id()::text and public.can_manage_business());
