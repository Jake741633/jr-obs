-- Sandbox-only billing persistence. No existing records/access gates are changed.
-- Apply only after isolated review and hosted schema verification.
begin;

create table public.jr_billing_customers (
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  mode text not null default 'test' check(mode = 'test'),
  account_id text not null default 'acct_1UWyMhRxGUITlJWL' check(account_id = 'acct_1UWyMhRxGUITlJWL'),
  customer_id text not null check(customer_id ~ '^cus_[a-zA-Z0-9]+$'),
  created_at timestamptz not null default now(),
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
    where attempts<10 and (state='pending' or (state='processing' and lease_expires_at<=clock_timestamp()))
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
  if p_outcome is null or p_outcome not in ('processed','retry','review') then
    raise exception 'billing_invalid_outcome' using errcode='22023';
  end if;
  update public.jr_billing_events
    set state=case when p_outcome='retry' and attempts<10 then 'pending'
      when p_outcome='retry' then 'review' else p_outcome end,
      lease_token=null,lease_expires_at=null,
      completed_at=case when p_outcome='processed' then clock_timestamp() else null end
    where event_id=p_event_id and mode='test' and account_id='acct_1UWyMhRxGUITlJWL'
      and state='processing' and lease_token=p_lease_token and lease_expires_at>clock_timestamp();
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke execute on function public.jr_billing_receive_event(text,jsonb),public.jr_billing_claim_event(),public.jr_billing_finish_event(text,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.jr_billing_receive_event(text,jsonb),public.jr_billing_claim_event(),public.jr_billing_finish_event(text,uuid,text)
  to service_role;

create or replace function public.jr_os_deployed_migration()
returns jsonb language sql immutable parallel safe security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('migration','20261101154212_subscription_billing_store.sql')
$$;
revoke execute on function public.jr_os_deployed_migration() from public,anon,authenticated,service_role;
grant execute on function public.jr_os_deployed_migration() to service_role;
notify pgrst,'reload schema';
commit;
