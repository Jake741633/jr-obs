-- Portal submissions store their workflow targets inside JSON payloads. The
-- relational customer/job envelope alone cannot prove that an approval names
-- a customer-visible pricing document or that an appointment request names the
-- matching planner entry. Enforce those references at the database boundary.

-- Customer sessions now read jobs through a projection, so an inline policy
-- subquery against public.jobs cannot see even their own canonical job row.
-- Keep the exact relationship check inside the existing non-bypassable trigger
-- and execute its canonical jobs lookup with fixed definer privileges.
create or replace function private.guard_jr_portal_record_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.customer_source_id is distinct from old.customer_source_id
      or new.job_source_id is distinct from old.job_source_id then
      raise exception 'Portal record customer and job bindings are immutable'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.job_source_id is not null
    and (
      new.customer_source_id is null
      or not exists (
        select 1
        from public.jobs job
        where job.organisation_id = new.organisation_id
          and job.source_id = new.job_source_id
          and job.customer_source_id is not distinct from new.customer_source_id
          and job.deleted_at is null
      )
    ) then
    raise exception 'Portal record job must belong to its organisation and customer'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_portal_record_binding()
from public, anon, authenticated;
grant execute on function private.guard_jr_portal_record_binding()
to service_role;

drop policy if exists portal_approvals_customer_insert on public.portal_approvals;
create policy portal_approvals_customer_insert on public.portal_approvals
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.current_jr_role() = 'customer'
  and customer_source_id = public.current_customer_source_id()
  and created_by = auth.uid()
  and updated_by = auth.uid()
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
);

create or replace function private.guard_jr_portal_target_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document_id text;
  target_document_type text;
  target_decision text;
  target_planner_id text;
begin
  if tg_table_name = 'portal_approvals' then
    if tg_op = 'UPDATE'
      and (
        new.payload -> 'documentId' is distinct from old.payload -> 'documentId'
        or new.payload -> 'documentType' is distinct from old.payload -> 'documentType'
      ) then
      raise exception 'Portal approval document bindings are immutable'
        using errcode = '23514';
    end if;

    target_document_id := new.payload ->> 'documentId';
    target_document_type := new.payload ->> 'documentType';
    target_decision := new.payload ->> 'decision';
    if new.customer_source_id is null
      or coalesce(jsonb_typeof(new.payload -> 'documentId'), '') <> 'string'
      or nullif(btrim(target_document_id), '') is null
      or coalesce(jsonb_typeof(new.payload -> 'documentType'), '') <> 'string'
      or target_document_type not in ('Quote', 'Estimate')
      or coalesce(jsonb_typeof(new.payload -> 'decision'), '') <> 'string'
      or target_decision not in ('Accepted', 'Declined') then
      raise exception 'Portal approval requires a valid pricing document target'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.pricing_documents pricing
      where pricing.organisation_id = new.organisation_id
        and pricing.source_id = target_document_id
        and (
          pricing.customer_source_id is not distinct from new.customer_source_id
          or (
            pricing.customer_source_id is null
            and pricing.job_source_id is not null
            and exists (
              select 1
              from public.jobs pricing_job
              where pricing_job.organisation_id = pricing.organisation_id
                and pricing_job.source_id = pricing.job_source_id
                and pricing_job.customer_source_id is not distinct from new.customer_source_id
                and (tg_op <> 'INSERT' or pricing_job.deleted_at is null)
            )
          )
        )
        and (new.job_source_id is null or pricing.job_source_id is not distinct from new.job_source_id)
        and pricing.payload ->> 'type' = target_document_type
        and (
          tg_op <> 'INSERT'
          or (
            pricing.deleted_at is null
            -- The pricing update and queued portal approval can reach the
            -- server in either order. Accept only the matching final state.
            and (
              pricing.payload ->> 'status' = 'Sent'
              or pricing.payload ->> 'status' = target_decision
            )
          )
        )
    ) then
      raise exception 'Portal approval document must be eligible for its organisation and customer'
        using errcode = '23503';
    end if;

  elsif tg_table_name = 'portal_requests' then
    if tg_op = 'UPDATE'
      and new.payload -> 'plannerEntryId' is distinct from old.payload -> 'plannerEntryId' then
      raise exception 'Portal request planner binding is immutable'
        using errcode = '23514';
    end if;

    if new.payload ? 'plannerEntryId' then
      target_planner_id := new.payload ->> 'plannerEntryId';
      if new.customer_source_id is null
        or coalesce(jsonb_typeof(new.payload -> 'plannerEntryId'), '') <> 'string'
        or nullif(btrim(target_planner_id), '') is null then
        raise exception 'Portal request requires a valid planner target'
          using errcode = '23514';
      end if;

      if not exists (
        select 1
        from public.planner_entries planner
        where planner.organisation_id = new.organisation_id
          and planner.source_id = target_planner_id
          and new.job_source_id is not null
          and planner.job_source_id is not distinct from new.job_source_id
          and (
            planner.customer_source_id is null
            or planner.customer_source_id is not distinct from new.customer_source_id
          )
          and (
            tg_op <> 'INSERT'
            or (
              planner.deleted_at is null
              and planner.payload ->> 'status' in ('Planned', 'Confirmed')
            )
          )
      ) then
        raise exception 'Portal request planner entry must be eligible for its organisation, customer and job'
          using errcode = '23503';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_portal_target_binding()
from public, anon, authenticated;
grant execute on function private.guard_jr_portal_target_binding()
to service_role;

-- Refuse to declare the boundary installed while a pre-existing portal row is
-- already cross-scoped or orphaned. Historical targets may since have changed
-- status, been cancelled or been soft-deleted, so the preflight validates the
-- stable relationship without rewriting legitimate audit history.
do $$
declare
  invalid_source_id text;
begin
  select approval.source_id
  into invalid_source_id
  from public.portal_approvals approval
  where approval.customer_source_id is null
    or coalesce(jsonb_typeof(approval.payload -> 'documentId'), '') <> 'string'
    or nullif(btrim(approval.payload ->> 'documentId'), '') is null
    or coalesce(jsonb_typeof(approval.payload -> 'documentType'), '') <> 'string'
    or approval.payload ->> 'documentType' not in ('Quote', 'Estimate')
    or not exists (
      select 1
      from public.pricing_documents pricing
      where pricing.organisation_id = approval.organisation_id
        and pricing.source_id = approval.payload ->> 'documentId'
        and (
          pricing.customer_source_id is not distinct from approval.customer_source_id
          or (
            pricing.customer_source_id is null
            and pricing.job_source_id is not null
            and exists (
              select 1
              from public.jobs pricing_job
              where pricing_job.organisation_id = pricing.organisation_id
                and pricing_job.source_id = pricing.job_source_id
                and pricing_job.customer_source_id is not distinct from approval.customer_source_id
            )
          )
        )
        and (approval.job_source_id is null or pricing.job_source_id is not distinct from approval.job_source_id)
        and pricing.payload ->> 'type' = approval.payload ->> 'documentType'
    )
  limit 1;

  if invalid_source_id is not null then
    raise exception 'Cannot secure portal approval % because its pricing document target is invalid', invalid_source_id;
  end if;

  invalid_source_id := null;
  select request.source_id
  into invalid_source_id
  from public.portal_requests request
  where request.payload ? 'plannerEntryId'
    and (
      request.customer_source_id is null
      or coalesce(jsonb_typeof(request.payload -> 'plannerEntryId'), '') <> 'string'
      or nullif(btrim(request.payload ->> 'plannerEntryId'), '') is null
      or not exists (
        select 1
        from public.planner_entries planner
        where planner.organisation_id = request.organisation_id
          and planner.source_id = request.payload ->> 'plannerEntryId'
          and request.job_source_id is not null
          and planner.job_source_id is not distinct from request.job_source_id
          and (
            planner.customer_source_id is null
            or planner.customer_source_id is not distinct from request.customer_source_id
          )
          and exists (
            select 1
            from public.jobs request_job
            where request_job.organisation_id = request.organisation_id
              and request_job.source_id = request.job_source_id
              and request_job.customer_source_id is not distinct from request.customer_source_id
          )
      )
    )
  limit 1;

  if invalid_source_id is not null then
    raise exception 'Cannot secure portal request % because its planner target is invalid', invalid_source_id;
  end if;
end
$$;

drop trigger if exists portal_approvals_target_binding_guard on public.portal_approvals;
create trigger portal_approvals_target_binding_guard
before insert or update on public.portal_approvals
for each row execute function private.guard_jr_portal_target_binding();

drop trigger if exists portal_requests_target_binding_guard on public.portal_requests;
create trigger portal_requests_target_binding_guard
before insert or update on public.portal_requests
for each row execute function private.guard_jr_portal_target_binding();

notify pgrst, 'reload schema';
