-- Bind each customer portal submission to the submitted job ID itself.
-- An unqualified outer job_source_id is rebound to public.jobs inside the
-- EXISTS subquery, which can let any valid customer job satisfy a forged ID.

drop policy if exists portal_approvals_customer_insert on public.portal_approvals;
create policy portal_approvals_customer_insert on public.portal_approvals
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.current_jr_role() = 'customer'
  and customer_source_id = public.current_customer_source_id()
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and (
    job_source_id is null
    or exists (
      select 1
      from public.jobs j
      where j.organisation_id = public.current_organisation_id()
        and j.source_id = portal_approvals.job_source_id
        and j.customer_source_id = public.current_customer_source_id()
        and j.deleted_at is null
    )
  )
);

drop policy if exists portal_requests_customer_insert on public.portal_requests;
create policy portal_requests_customer_insert on public.portal_requests
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.current_jr_role() = 'customer'
  and customer_source_id = public.current_customer_source_id()
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and (
    job_source_id is null
    or exists (
      select 1
      from public.jobs j
      where j.organisation_id = public.current_organisation_id()
        and j.source_id = portal_requests.job_source_id
        and j.customer_source_id = public.current_customer_source_id()
        and j.deleted_at is null
    )
  )
);
