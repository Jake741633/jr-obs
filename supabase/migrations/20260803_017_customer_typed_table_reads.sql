-- Restrict customer reads across typed entity tables. A matching customer ID
-- must not expose internal finance, stock, staff, testing, or AI records.

do $$
declare t text;
begin
  foreach t in array array[
    'builders',
    'expenses',
    'materials',
    'stock_items',
    'stock_movements',
    'purchase_lists',
    'team_members',
    'timesheets',
    'electrical_testing_records',
    'ai_recommendation_evidence'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        organisation_id = public.current_organisation_id()
        and public.current_jr_role() in (''owner'',''admin'',''office'',''electrician'')
      )',
      t||'_select',
      t
    );
  end loop;

  foreach t in array array[
    'customers',
    'jobs',
    'pricing_documents',
    'invoices',
    'payments',
    'planner_entries',
    'certificates',
    'job_documents',
    'portal_approvals',
    'portal_requests'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        organisation_id = public.current_organisation_id()
        and (
          public.current_jr_role() <> ''customer''
          or customer_source_id = public.current_customer_source_id()
        )
      )',
      t||'_select',
      t
    );
  end loop;
end $$;
