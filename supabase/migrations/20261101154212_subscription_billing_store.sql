-- Sandbox-only billing persistence. No existing records/access gates are changed.
-- Apply only after isolated review and hosted schema verification.
begin;

create table public.jr_billing_customers (
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  mode text not null default 'test' check(mode = 'test'),
  account_id text not null default 'acct_1UWyMhRxGUITlJWL' check(account_id = 'acct_1UWyMhRxGUITlJWL'),
  customer_id text not null check(customer_id ~ '^cus_[a-zA-Z0-9]+$'),
  created_at timestamptz not null default now(),
  reconcile_token uuid unique,
  reconcile_expires_at timestamptz,
  reconcile_event_id text,
  reconcile_event_lease uuid,
  check ((reconcile_token is null and reconcile_expires_at is null and reconcile_event_id is null and reconcile_event_lease is null)
    or (reconcile_token is not null and reconcile_expires_at is not null and reconcile_event_id is not null and reconcile_event_lease is not null)),
  primary key(mode,account_id,organisation_id),
  unique(mode,account_id,customer_id),
  unique(mode,account_id,organisation_id,customer_id)
);

create table public.jr_billing_subscriptions (
  mode text not null default 'test',
  account_id text not null default 'acct_1UWyMhRxGUITlJWL',
  organisation_id uuid not null,
  customer_id text not null,
  subscription_id text not null check(subscription_id ~ '^sub_[a-zA-Z0-9]+$'),
  price_id text not null,
  status text not null check(status in ('active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
  paid_through timestamptz,
  paid_invoice_id text,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  reconciled_at timestamptz not null default now(),
  primary key(mode,account_id,subscription_id),
  foreign key(mode,account_id,organisation_id,customer_id)
    references public.jr_billing_customers(mode,account_id,organisation_id,customer_id) on delete restrict,
  check(paid_through is null or (paid_invoice_id is not null and paid_invoice_id ~ '^in_[a-zA-Z0-9]+$'))
);
create unique index jr_billing_one_current_subscription on public.jr_billing_subscriptions(mode,account_id,organisation_id)
  where status not in ('canceled','incomplete_expired');

create table public.jr_billing_operations (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'test',
  account_id text not null default 'acct_1UWyMhRxGUITlJWL',
  organisation_id uuid not null,
  customer_id text not null,
  kind text not null check(kind in ('checkout','portal')),
  plan text,
  state text not null default 'pending' check(state in ('pending','succeeded','failed')),
  provider_session_id text,
  created_at timestamptz not null default now(),
  foreign key(mode,account_id,organisation_id,customer_id)
    references public.jr_billing_customers(mode,account_id,organisation_id,customer_id) on delete restrict,
  check((kind='checkout' and plan is not null and plan in ('monthly','annual')) or (kind='portal' and plan is null))
);
create unique index jr_billing_one_pending_checkout on public.jr_billing_operations(mode,account_id,organisation_id)
  where kind='checkout' and state='pending';

create table public.jr_billing_events (
  mode text not null default 'test' check(mode='test'),
  account_id text not null check(account_id='acct_1UWyMhRxGUITlJWL'),
  event_id text not null check(event_id ~ '^evt_[a-zA-Z0-9_]+$'),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  state text not null default 'pending' check(state in ('pending','processing','processed','review')),
  attempts integer not null default 0 check(attempts>=0),
  lease_token uuid,
  lease_expires_at timestamptz,
  received_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key(mode,account_id,event_id),
  check((state='processing' and lease_token is not null and lease_expires_at is not null)
    or (state<>'processing' and lease_token is null and lease_expires_at is null))
);
create index jr_billing_events_pending on public.jr_billing_events(received_at,event_id)
  where state in ('pending','processing');

alter table public.jr_billing_customers enable row level security;
alter table public.jr_billing_subscriptions enable row level security;
alter table public.jr_billing_operations enable row level security;
alter table public.jr_billing_events enable row level security;
revoke all on public.jr_billing_customers,public.jr_billing_subscriptions,public.jr_billing_operations,public.jr_billing_events
  from public,anon,authenticated;
grant select,insert,update,delete on public.jr_billing_customers,public.jr_billing_subscriptions,public.jr_billing_operations,public.jr_billing_events
  to service_role;
-- No browser policies: even accidental future table grants must fail closed.

create function public.jr_billing_receive_event(p_account_id text,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  if p_account_id is distinct from 'acct_1UWyMhRxGUITlJWL'
    or pg_catalog.jsonb_typeof(p_event) is distinct from 'object'
    or p_event->>'object' is distinct from 'event'
    or p_event->'livemode' is distinct from 'false'::jsonb
    or p_event ? 'account' or p_event ? 'context'
    or pg_catalog.jsonb_typeof(p_event->'id') is distinct from 'string'
    or (p_event->>'id') !~ '^evt_[a-zA-Z0-9_]+$'
    or pg_catalog.jsonb_typeof(p_event->'type') is distinct from 'string'
    or length(p_event->>'type') not between 1 and 128
    or pg_catalog.jsonb_typeof(p_event#>'{data,object}') is distinct from 'object'
    or pg_catalog.octet_length(p_event::text)>1000000 then
    raise exception 'billing_invalid_event' using errcode='22023';
  end if;
  insert into public.jr_billing_events(account_id,event_id,payload)
    values(p_account_id,p_event->>'id',p_event) on conflict do nothing;
  get diagnostics inserted=row_count;
  return pg_catalog.jsonb_build_object('received',true,'duplicate',inserted=0);
end $$;

create function public.jr_billing_claim_event()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.jr_billing_events%rowtype;
begin
  update public.jr_billing_events set state='review',lease_token=null,lease_expires_at=null
    where attempts>=10 and (state='pending' or (state='processing' and lease_expires_at<=clock_timestamp()));
  select * into candidate from public.jr_billing_events
    where attempts<10 and ((state='pending' and available_at<=clock_timestamp()) or (state='processing' and lease_expires_at<=clock_timestamp()))
    order by received_at,event_id for update skip locked limit 1;
  if not found then return null; end if;
  update public.jr_billing_events set state='processing',attempts=attempts+1,
    lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
    where mode=candidate.mode and account_id=candidate.account_id and event_id=candidate.event_id
    returning * into candidate;
  return pg_catalog.jsonb_build_object('event_id',candidate.event_id,'payload',candidate.payload,
    'lease_token',candidate.lease_token,'attempts',candidate.attempts);
end $$;

create function public.jr_billing_finish_event(p_event_id text,p_lease_token uuid,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_outcome is null or p_outcome not in ('processed','retry','review','defer') then
    raise exception 'billing_invalid_outcome' using errcode='22023';
  end if;
  update public.jr_billing_events
    set state=case when p_outcome='defer' or (p_outcome='retry' and attempts<10) then 'pending'
      when p_outcome='retry' then 'review' else p_outcome end,
      attempts=case when p_outcome='defer' then greatest(attempts-1,0) else attempts end,
      available_at=case when p_outcome='defer' then clock_timestamp()+interval '60 seconds' when p_outcome='retry' then clock_timestamp()+interval '30 seconds' else available_at end,
      lease_token=null,lease_expires_at=null,
      completed_at=case when p_outcome='processed' then clock_timestamp() else null end
    where event_id=p_event_id and mode='test' and account_id='acct_1UWyMhRxGUITlJWL'
      and state='processing' and lease_token=p_lease_token and lease_expires_at>clock_timestamp();
  get diagnostics changed=row_count;
  if changed=1 then
    update public.jr_billing_customers set reconcile_token=null,reconcile_expires_at=null,reconcile_event_id=null,reconcile_event_lease=null
      where reconcile_event_id=p_event_id and reconcile_event_lease=p_lease_token;
  end if;
  return changed=1;
end $$;

revoke execute on function public.jr_billing_receive_event(text,jsonb),public.jr_billing_claim_event(),public.jr_billing_finish_event(text,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.jr_billing_receive_event(text,jsonb),public.jr_billing_claim_event(),public.jr_billing_finish_event(text,uuid,text)
  to service_role;

create function public.jr_billing_begin_reconciliation(p_event_id text,p_lease_token uuid,p_customer_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.jr_billing_events%rowtype; c public.jr_billing_customers%rowtype;
begin
  select * into e from public.jr_billing_events where mode='test' and account_id='acct_1UWyMhRxGUITlJWL' and event_id=p_event_id for update;
  if not found or e.state<>'processing' or e.lease_token is distinct from p_lease_token or e.lease_expires_at<=clock_timestamp() then
    return pg_catalog.jsonb_build_object('state','stale');
  end if;
  select * into c from public.jr_billing_customers where mode=e.mode and account_id=e.account_id and customer_id=p_customer_id for update;
  if not found then return pg_catalog.jsonb_build_object('state','unbound'); end if;
  if c.reconcile_token is not null and c.reconcile_expires_at>clock_timestamp() then
    if c.reconcile_event_id=p_event_id and c.reconcile_event_lease=p_lease_token then
      return pg_catalog.jsonb_build_object('state','acquired','organisation_id',c.organisation_id,'token',c.reconcile_token);
    end if;
    return pg_catalog.jsonb_build_object('state','busy');
  end if;
  -- Recheck after the customer row lock; waiting must not extend an expired job.
  if e.lease_expires_at<=clock_timestamp() then return pg_catalog.jsonb_build_object('state','stale'); end if;
  update public.jr_billing_customers set reconcile_token=gen_random_uuid(),
    reconcile_expires_at=least(e.lease_expires_at,clock_timestamp()+interval '45 seconds'),
    reconcile_event_id=p_event_id,reconcile_event_lease=p_lease_token
    where mode=c.mode and account_id=c.account_id and organisation_id=c.organisation_id returning * into c;
  return pg_catalog.jsonb_build_object('state','acquired','organisation_id',c.organisation_id,'token',c.reconcile_token);
end $$;

create function public.jr_billing_complete_reconciliation(p_event_id text,p_lease_token uuid,p_reconcile_token uuid,p_snapshot jsonb,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.jr_billing_events%rowtype; c public.jr_billing_customers%rowtype; field text; changed integer;
begin
  select * into e from public.jr_billing_events where mode='test' and account_id='acct_1UWyMhRxGUITlJWL' and event_id=p_event_id for update;
  if not found or e.state<>'processing' or e.lease_token is distinct from p_lease_token then return false; end if;
  select * into c from public.jr_billing_customers where mode=e.mode and account_id=e.account_id
    and reconcile_token=p_reconcile_token and reconcile_event_id=p_event_id and reconcile_event_lease=p_lease_token for update;
  if not found or e.lease_expires_at<=clock_timestamp() or c.reconcile_expires_at<=clock_timestamp() then return false; end if;
  if p_outcome is null or p_outcome not in ('processed','retry','review') then raise exception 'billing_invalid_outcome'; end if;
  if p_outcome='processed' then
    if pg_catalog.jsonb_typeof(p_snapshot) is distinct from 'object' then raise exception 'billing_invalid_snapshot'; end if;
    foreach field in array array['organisationId','customerId','subscriptionId','priceId','status'] loop
      if pg_catalog.jsonb_typeof(p_snapshot->field) is distinct from 'string' then raise exception 'billing_invalid_snapshot'; end if;
    end loop;
    if p_snapshot->>'organisationId' is distinct from c.organisation_id::text or p_snapshot->>'customerId' is distinct from c.customer_id
      or (p_snapshot->>'subscriptionId') !~ '^sub_[a-zA-Z0-9]+$'
      or p_snapshot->>'priceId' not in ('price_1UX0fdRxGUITlJWLXoEGdcBE','price_1UX0fpRxGUITlJWLs2gwl34S')
      or p_snapshot->>'status' not in ('active','trialing','canceled','past_due','unpaid','paused','incomplete','incomplete_expired')
      or pg_catalog.jsonb_typeof(p_snapshot->'cancelAtPeriodEnd') is distinct from 'boolean' then raise exception 'billing_invalid_snapshot'; end if;
    if p_snapshot->>'status'='active' then
      if pg_catalog.jsonb_typeof(p_snapshot->'paidThroughMs') is distinct from 'number'
        or pg_catalog.jsonb_typeof(p_snapshot->'paidInvoiceId') is distinct from 'string'
        or (p_snapshot->>'paidInvoiceId') !~ '^in_[a-zA-Z0-9]+$'
        or p_snapshot->'trialEndsAtMs' is distinct from 'null'::jsonb then raise exception 'billing_invalid_snapshot'; end if;
    elsif p_snapshot->>'status'='trialing' then
      if pg_catalog.jsonb_typeof(p_snapshot->'trialEndsAtMs') is distinct from 'number'
        or p_snapshot->'paidThroughMs' is distinct from 'null'::jsonb or p_snapshot->'paidInvoiceId' is distinct from 'null'::jsonb then raise exception 'billing_invalid_snapshot'; end if;
    elsif p_snapshot->'trialEndsAtMs' is distinct from 'null'::jsonb or p_snapshot->'paidThroughMs' is distinct from 'null'::jsonb or p_snapshot->'paidInvoiceId' is distinct from 'null'::jsonb then raise exception 'billing_invalid_snapshot'; end if;
    foreach field in array array['paidThroughMs','trialEndsAtMs'] loop
      if p_snapshot->field is distinct from 'null'::jsonb then
        if (p_snapshot->>field)::numeric<=0 or (p_snapshot->>field)::numeric>8640000000000000
          or floor((p_snapshot->>field)::numeric)<>(p_snapshot->>field)::numeric then raise exception 'billing_invalid_snapshot'; end if;
      end if;
    end loop;
    insert into public.jr_billing_subscriptions(mode,account_id,organisation_id,customer_id,subscription_id,price_id,status,paid_through,paid_invoice_id,trial_ends_at,cancel_at_period_end,reconciled_at)
      values(c.mode,c.account_id,c.organisation_id,c.customer_id,p_snapshot->>'subscriptionId',p_snapshot->>'priceId',p_snapshot->>'status',
        to_timestamp((p_snapshot->>'paidThroughMs')::double precision/1000),p_snapshot->>'paidInvoiceId',
        to_timestamp((p_snapshot->>'trialEndsAtMs')::double precision/1000),(p_snapshot->>'cancelAtPeriodEnd')::boolean,clock_timestamp())
      on conflict(mode,account_id,subscription_id) do update set price_id=excluded.price_id,status=excluded.status,
        paid_through=excluded.paid_through,paid_invoice_id=excluded.paid_invoice_id,trial_ends_at=excluded.trial_ends_at,
        cancel_at_period_end=excluded.cancel_at_period_end,reconciled_at=excluded.reconciled_at
        where jr_billing_subscriptions.organisation_id=excluded.organisation_id and jr_billing_subscriptions.customer_id=excluded.customer_id;
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'billing_invalid_snapshot'; end if;
  elsif p_snapshot is not null then raise exception 'billing_invalid_snapshot'; end if;
  if not public.jr_billing_finish_event(p_event_id,p_lease_token,p_outcome) then raise exception 'billing_expired_lease'; end if;
  update public.jr_billing_customers set reconcile_token=null,reconcile_expires_at=null,reconcile_event_id=null,reconcile_event_lease=null
    where mode=c.mode and account_id=c.account_id and organisation_id=c.organisation_id;
  return true;
end $$;

revoke execute on function public.jr_billing_begin_reconciliation(text,uuid,text),public.jr_billing_complete_reconciliation(text,uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.jr_billing_begin_reconciliation(text,uuid,text),public.jr_billing_complete_reconciliation(text,uuid,uuid,jsonb,text)
  to service_role;

-- Private definer is necessary to read service-owned billing tables. Every
-- invocation checks the existing live membership/session helpers first.
create schema if not exists private;
grant usage on schema private to authenticated;
create function private.jr_billing_owner_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid; business uuid; current_subscription public.jr_billing_subscriptions%rowtype;
begin
  actor:=auth.uid();business:=private.current_organisation_id();
  if actor is null or business is null or private.current_jr_role() is distinct from 'owner'
    or not coalesce(private.is_organisation_member(business),false)
    or coalesce(auth.jwt()->'is_anonymous','false'::jsonb) is distinct from 'false'::jsonb then
    raise exception 'billing_access_denied' using errcode='42501';
  end if;
  -- AMR is signed Auth provenance, never client-editable user metadata.
  if auth.jwt()->'amr' is not null then
    if pg_catalog.jsonb_typeof(auth.jwt()->'amr') is distinct from 'array' then
      raise exception 'billing_access_denied' using errcode='42501';
    end if;
    if exists(select 1 from pg_catalog.jsonb_array_elements(auth.jwt()->'amr') method where method->>'method' in ('recovery','anonymous')) then
      raise exception 'billing_access_denied' using errcode='42501';
    end if;
  end if;
  select * into current_subscription from public.jr_billing_subscriptions
    where organisation_id=business and mode='test' and account_id='acct_1UWyMhRxGUITlJWL'
    order by case when status in ('canceled','incomplete_expired') then 1 else 0 end,reconciled_at desc,subscription_id limit 1;
  return pg_catalog.jsonb_build_object('actorUserId',actor,'organisationId',business,'role','owner','mode','test',
    'subscription',case when current_subscription.subscription_id is null then null else pg_catalog.jsonb_build_object(
      'plan',case current_subscription.price_id when 'price_1UX0fdRxGUITlJWLXoEGdcBE' then 'monthly' when 'price_1UX0fpRxGUITlJWLs2gwl34S' then 'annual' else null end,
      'status',current_subscription.status,'paidThroughMs',floor(extract(epoch from current_subscription.paid_through)*1000),
      'trialEndsAtMs',floor(extract(epoch from current_subscription.trial_ends_at)*1000),'cancelAtPeriodEnd',current_subscription.cancel_at_period_end,
      'reconciledAtMs',floor(extract(epoch from current_subscription.reconciled_at)*1000)) end);
end $$;
revoke execute on function private.jr_billing_owner_status() from public,anon,authenticated,service_role;
grant execute on function private.jr_billing_owner_status() to authenticated;
create function public.jr_billing_owner_status()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.jr_billing_owner_status() $$;
revoke execute on function public.jr_billing_owner_status() from public,anon,authenticated,service_role;
grant execute on function public.jr_billing_owner_status() to authenticated;

create or replace function public.jr_os_deployed_migration()
returns jsonb language sql immutable parallel safe security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('migration','20261101154212_subscription_billing_store.sql')
$$;
revoke execute on function public.jr_os_deployed_migration() from public,anon,authenticated,service_role;
grant execute on function public.jr_os_deployed_migration() to service_role;
notify pgrst,'reload schema';
commit;
