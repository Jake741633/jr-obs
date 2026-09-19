do $$
declare t text;
begin
  foreach t in array array[
    'customers','builders','pricing_documents','invoices','payments','expenses','team_members','ai_recommendation_evidence'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_office_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        organisation_id = public.current_organisation_id()
        and public.can_manage_office_data()
        and created_by = auth.uid()
        and updated_by = auth.uid()
      )',
      t||'_office_insert',
      t
    );
  end loop;

  foreach t in array array[
    'jobs','materials','stock_items','stock_movements','purchase_lists','planner_entries','timesheets','certificates','electrical_testing_records','job_documents'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_field_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        organisation_id = public.current_organisation_id()
        and public.can_manage_field_data()
        and created_by = auth.uid()
        and updated_by = auth.uid()
      )',
      t||'_field_insert',
      t
    );
  end loop;
end $$;

drop policy if exists portal_approvals_staff_insert on public.portal_approvals;
create policy portal_approvals_staff_insert on public.portal_approvals
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists portal_requests_staff_insert on public.portal_requests;
create policy portal_requests_staff_insert on public.portal_requests
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);
