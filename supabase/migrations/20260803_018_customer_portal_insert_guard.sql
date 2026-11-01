-- Bind customer portal submissions to the authenticated actor and to jobs that
-- belong to the same customer. Customer scope alone must not permit forged actor
-- metadata or cross-customer job references.

drop policy if exists portal_approvals_customer_insert on public.portal_approvals;
drop policy if exists portal_requests_customer_insert on public.portal_requests;

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
        and j.source_id = job_source_id
        and j.customer_source_id = public.current_customer_source_id()
        and j.deleted_at is null
    )
  )
);

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
        and j.source_id = job_source_id
        and j.customer_source_id = public.current_customer_source_id()
        and j.deleted_at is null
    )
  )
);
