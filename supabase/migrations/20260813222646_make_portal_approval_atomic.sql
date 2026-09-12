-- A portal approval is both legal evidence and the state transition for the
-- pricing document the customer saw. Previously those writes were queued
-- independently: the approval could succeed while the customer-authored
-- pricing update failed RLS, leaving the quote Sent and permitting an
-- opposite decision. Serialize the decision on the canonical pricing row and
-- perform both changes in the approval INSERT transaction.

create or replace function private.guard_jr_portal_approval_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  canonical_pricing_id uuid;
  canonical_terms text;
  canonical_status text;
  canonical_version integer;
  submitted_document_version integer;
  target_decision text;
  received_decision_time timestamptz;
  receipt_time timestamptz;
  receipt_time_text text;
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

  target_decision := new.payload ->> 'decision';
  if coalesce(jsonb_typeof(new.payload -> 'documentId'), '') <> 'string'
    or nullif(btrim(new.payload ->> 'documentId'), '') is null
    or coalesce(jsonb_typeof(new.payload -> 'documentType'), '') <> 'string'
    or new.payload ->> 'documentType' not in ('Quote', 'Estimate')
    or coalesce(jsonb_typeof(new.payload -> 'documentVersion'), '') <> 'number'
    or (new.payload ->> 'documentVersion') !~ '^[1-9][0-9]*$'
    or coalesce(jsonb_typeof(new.payload -> 'decision'), '') <> 'string'
    or target_decision not in ('Accepted', 'Declined')
    or coalesce(jsonb_typeof(new.payload -> 'approvalName'), '') <> 'string'
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

  begin
    submitted_document_version := (new.payload ->> 'documentVersion')::integer;
  exception
    when numeric_value_out_of_range then
      raise exception 'Portal approval requires a valid document version'
        using errcode = '23514';
  end;

  if new.customer_source_id is null then
    raise exception 'Portal approval evidence requires a customer pricing document'
      using errcode = '23503';
  end if;

  -- The row lock is the concurrency boundary. A second decision waits here,
  -- then observes the final status written by the winning transaction.
  select
    pricing.id,
    case
      when jsonb_typeof(pricing.payload -> 'terms') = 'string'
        then pricing.payload ->> 'terms'
      else ''
    end,
    pricing.payload ->> 'status',
    pricing.version
  into
    canonical_pricing_id,
    canonical_terms,
    canonical_status,
    canonical_version
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
    and pricing.deleted_at is null
  for update of pricing;

  if not found then
    raise exception 'Portal approval evidence must match its customer pricing document'
      using errcode = '23503';
  end if;

  if new.payload ->> 'termsSnapshot' is distinct from canonical_terms then
    raise exception 'Portal approval terms snapshot must match the pricing document'
      using errcode = '23514';
  end if;

  if new.payload ->> 'documentType' = 'Quote'
    and target_decision = 'Accepted'
    and canonical_terms <> ''
    and new.payload -> 'termsAccepted' is distinct from 'true'::jsonb then
    raise exception 'Accepted quote terms must be explicitly accepted'
      using errcode = '23514';
  end if;

  if submitted_document_version is distinct from canonical_version then
    raise exception 'Portal approval document version is no longer current'
      using errcode = '23503';
  end if;

  if canonical_status is distinct from 'Sent' then
    raise exception 'Portal approval document is no longer awaiting a decision'
      using errcode = '23503';
  end if;

  receipt_time := statement_timestamp();
  receipt_time_text := to_char(
    receipt_time at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  new.payload := jsonb_set(
    new.payload,
    '{decidedAt}',
    to_jsonb(receipt_time_text),
    true
  );
  new.source_updated_at := receipt_time;
  new.created_at := receipt_time;
  new.updated_at := receipt_time;

  if canonical_status = 'Sent' then
    update public.pricing_documents pricing
    set payload = jsonb_set(
          jsonb_set(
            pricing.payload,
            '{status}',
            to_jsonb(target_decision),
            true
          ),
          '{updatedAt}',
          to_jsonb(receipt_time_text),
          true
        ),
        source_updated_at = receipt_time
    where pricing.id = canonical_pricing_id;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_portal_approval_evidence()
from public, anon, authenticated;
grant execute on function private.guard_jr_portal_approval_evidence()
to service_role;

-- Include the exact visible projection version in the allowlisted payload so
-- an offline decision can prove which revision the customer reviewed. The
-- value is projection metadata, never caller-controlled source JSON.
create or replace function private.bind_jr_customer_pricing_document_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.payload := jsonb_set(
    new.payload,
    '{documentVersion}',
    to_jsonb(new.version),
    true
  );
  return new;
end;
$$;

revoke execute on function private.bind_jr_customer_pricing_document_version()
from public, anon, authenticated, service_role;

drop trigger if exists customer_pricing_document_version_binding
on public.customer_pricing_documents;
create trigger customer_pricing_document_version_binding
before insert or update on public.customer_pricing_documents
for each row execute function private.bind_jr_customer_pricing_document_version();

update public.customer_pricing_documents projection
set payload = jsonb_set(
  projection.payload,
  '{documentVersion}',
  to_jsonb(projection.version),
  true
);

-- Earlier clients could leave one approval beside a still-Sent quote. Repair
-- that state before enforcing the new boundary. Multiple rows for one document
-- cannot be reconciled without choosing between legal evidence, so stop and
-- require an explicit operator decision instead of guessing.
do $$
declare
  duplicate_document_id text;
begin
  select approval.payload ->> 'documentId'
  into duplicate_document_id
  from public.portal_approvals approval
  group by approval.organisation_id, approval.payload ->> 'documentId'
  having count(*) > 1
  limit 1;

  if duplicate_document_id is not null then
    raise exception 'Cannot make portal approvals atomic because document % has multiple historical decisions', duplicate_document_id;
  end if;

end
$$;

update public.pricing_documents pricing
set payload = jsonb_set(
      jsonb_set(
        pricing.payload,
        '{status}',
        to_jsonb(approval.payload ->> 'decision'),
        true
      ),
      '{updatedAt}',
      to_jsonb(to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      true
    ),
    source_updated_at = statement_timestamp()
from public.portal_approvals approval
where approval.organisation_id = pricing.organisation_id
  and approval.payload ->> 'documentId' = pricing.source_id
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
          and pricing_job.deleted_at is null
      )
    )
  )
  and (approval.job_source_id is null or approval.job_source_id is not distinct from pricing.job_source_id)
  and approval.payload ->> 'documentType' = pricing.payload ->> 'type'
  and approval.deleted_at is null
  and pricing.deleted_at is null
  and pricing.payload ->> 'status' = 'Sent'
  and approval.payload ->> 'decision' in ('Accepted', 'Declined')
  and pricing.updated_at <= approval.created_at
  and approval.created_at = approval.updated_at
  and approval.created_at = approval.source_updated_at
  and date_trunc('milliseconds', approval.created_at)
    = (approval.payload ->> 'decidedAt')::timestamptz;

do $$
declare
  conflicting_document_id text;
begin
  select approval.payload ->> 'documentId'
  into conflicting_document_id
  from public.portal_approvals approval
  join public.pricing_documents pricing
    on pricing.organisation_id = approval.organisation_id
   and pricing.source_id = approval.payload ->> 'documentId'
  where pricing.deleted_at is null
    and approval.deleted_at is null
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
            and pricing_job.deleted_at is null
        )
      )
    )
    and (approval.job_source_id is null or approval.job_source_id is not distinct from pricing.job_source_id)
    and approval.payload ->> 'documentType' = pricing.payload ->> 'type'
    and pricing.payload ->> 'status' is distinct from approval.payload ->> 'decision'
    and (
      pricing.payload ->> 'status' in ('Accepted', 'Declined')
      or pricing.updated_at <= approval.created_at
    )
  limit 1;

  if conflicting_document_id is not null then
    raise exception 'Cannot make portal approvals atomic because document % conflicts with its historical decision', conflicting_document_id;
  end if;
end
$$;

-- A document may be revised and re-sent under the same stable source ID. The
-- submitted and locked version identifies the exact customer-visible revision while
-- preventing duplicate or contradictory evidence for that revision.
create unique index if not exists portal_approvals_document_version_unique
on public.portal_approvals (
  organisation_id,
  ((payload ->> 'documentId')),
  ((payload -> 'documentVersion'))
)
where jsonb_typeof(payload -> 'documentId') = 'string'
  and jsonb_typeof(payload -> 'documentVersion') = 'number';

drop trigger if exists portal_approvals_evidence_guard on public.portal_approvals;
create trigger portal_approvals_evidence_guard
before insert or update on public.portal_approvals
for each row execute function private.guard_jr_portal_approval_evidence();

-- The evidence guard now performs the complete target validation while the
-- canonical pricing row is locked. Remove the older unlocked approval target
-- trigger; the same function remains installed for portal request targets.
drop trigger if exists portal_approvals_target_binding_guard on public.portal_approvals;

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration',
    '20260813222646_make_portal_approval_atomic.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
