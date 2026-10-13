-- Portal approvals are legal/audit evidence. The browser supplies the signer
-- and terms snapshot, but a direct Data API caller must not be able to omit or
-- forge that evidence. Bind it to the canonical pricing document, author the
-- receipt timestamp on the server, and make the recorded payload append-only.
--
-- This migration intentionally does not implement the separate pricing status
-- transition/replay state machine. The existing target guard continues to
-- enforce that the referenced pricing document is eligible for the decision.

create or replace function private.guard_jr_portal_approval_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  canonical_terms text;
  received_decision_time timestamptz;
  receipt_time timestamptz;
begin
  actor_user_id := auth.uid();
  if actor_user_id is not null
    and (
      not private.has_active_auth_session()
      or not exists (
        select 1
        from public.profiles actor_profile
        where actor_profile.id = actor_user_id
          and actor_profile.active
          and actor_profile.organisation_id = new.organisation_id
          and (
            actor_profile.role in ('owner', 'admin', 'office')
            or (
              actor_profile.role = 'customer'
              and actor_profile.customer_source_id is not distinct from new.customer_source_id
            )
          )
      )
      or (
        tg_op = 'INSERT'
        and (
          new.created_by is distinct from actor_user_id
          or new.updated_by is distinct from actor_user_id
        )
      )
    ) then
    raise exception 'Portal approval authorization is invalid'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.payload is distinct from old.payload
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception 'Portal approval evidence is immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if coalesce(jsonb_typeof(new.payload -> 'approvalName'), '') <> 'string'
    or nullif(btrim(new.payload ->> 'approvalName'), '') is null
    or coalesce(jsonb_typeof(new.payload -> 'comments'), '') <> 'string'
    or coalesce(jsonb_typeof(new.payload -> 'termsAccepted'), '') <> 'boolean'
    or coalesce(jsonb_typeof(new.payload -> 'termsSnapshot'), '') <> 'string'
    or coalesce(jsonb_typeof(new.payload -> 'decidedAt'), '') <> 'string'
    or (new.payload ->> 'decidedAt') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then
    raise exception 'Portal approval requires complete legal evidence'
      using errcode = '23514';
  end if;

  begin
    received_decision_time := (new.payload ->> 'decidedAt')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Portal approval requires a valid decision timestamp'
        using errcode = '23514';
  end;

  if new.customer_source_id is null then
    raise exception 'Portal approval evidence requires a customer pricing document'
      using errcode = '23503';
  end if;

  select case
    when jsonb_typeof(pricing.payload -> 'terms') = 'string'
      then pricing.payload ->> 'terms'
    else ''
  end
  into canonical_terms
  from public.pricing_documents pricing
  where pricing.organisation_id = new.organisation_id
    and pricing.source_id = new.payload ->> 'documentId'
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
            and pricing_job.deleted_at is null
        )
      )
    )
    and (new.job_source_id is null or pricing.job_source_id is not distinct from new.job_source_id)
    and pricing.payload ->> 'type' = new.payload ->> 'documentType'
    and pricing.deleted_at is null;

  if not found then
    raise exception 'Portal approval evidence must match its customer pricing document'
      using errcode = '23503';
  end if;

  if new.payload ->> 'termsSnapshot' is distinct from canonical_terms then
    raise exception 'Portal approval terms snapshot must match the pricing document'
      using errcode = '23514';
  end if;

  if new.payload ->> 'documentType' = 'Quote'
    and new.payload ->> 'decision' = 'Accepted'
    and canonical_terms <> ''
    and new.payload -> 'termsAccepted' is distinct from 'true'::jsonb then
    raise exception 'Accepted quote terms must be explicitly accepted'
      using errcode = '23514';
  end if;

  receipt_time := statement_timestamp();
  new.payload := jsonb_set(
    new.payload,
    '{decidedAt}',
    to_jsonb(to_char(receipt_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  );
  new.source_updated_at := receipt_time;
  new.created_at := receipt_time;
  new.updated_at := receipt_time;
  return new;
end;
$$;

revoke execute on function private.guard_jr_portal_approval_evidence()
from public, anon, authenticated;
grant execute on function private.guard_jr_portal_approval_evidence()
to service_role;

-- Refuse to install an immutable evidence boundary over incomplete historical
-- rows. Historical snapshots are not compared with today's pricing terms,
-- because a valid quote may have changed after the decision was recorded.
do $$
declare
  approval_record record;
  invalid_source_id text;
  historical_decision_time timestamptz;
begin
  select approval.source_id
  into invalid_source_id
  from public.portal_approvals approval
  where coalesce(jsonb_typeof(approval.payload -> 'approvalName'), '') <> 'string'
    or nullif(btrim(approval.payload ->> 'approvalName'), '') is null
    or coalesce(jsonb_typeof(approval.payload -> 'comments'), '') <> 'string'
    or coalesce(jsonb_typeof(approval.payload -> 'termsAccepted'), '') <> 'boolean'
    or coalesce(jsonb_typeof(approval.payload -> 'termsSnapshot'), '') <> 'string'
    or coalesce(jsonb_typeof(approval.payload -> 'decidedAt'), '') <> 'string'
    or coalesce(jsonb_typeof(approval.payload -> 'decision'), '') <> 'string'
    or approval.payload ->> 'decision' not in ('Accepted', 'Declined')
    or (approval.payload ->> 'decidedAt') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or (
      approval.payload ->> 'documentType' = 'Quote'
      and approval.payload ->> 'decision' = 'Accepted'
      and approval.payload ->> 'termsSnapshot' <> ''
      and approval.payload -> 'termsAccepted' is distinct from 'true'::jsonb
    )
  limit 1;

  if invalid_source_id is not null then
    raise exception 'Cannot secure portal approval % because its legal evidence is incomplete', invalid_source_id;
  end if;

  for approval_record in
    select approval.source_id, approval.payload ->> 'decidedAt' as decided_at
    from public.portal_approvals approval
  loop
    begin
      historical_decision_time := approval_record.decided_at::timestamptz;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Cannot secure portal approval % because its decision timestamp is invalid', approval_record.source_id;
    end;
  end loop;
end
$$;

drop trigger if exists portal_approvals_evidence_guard on public.portal_approvals;
create trigger portal_approvals_evidence_guard
before insert or update on public.portal_approvals
for each row execute function private.guard_jr_portal_approval_evidence();

notify pgrst, 'reload schema';
