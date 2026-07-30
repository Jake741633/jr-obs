create table if not exists public.cloud_collections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection_key text not null,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null default 1 check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, collection_key, source_id)
);

create index if not exists cloud_collections_org_collection_idx on public.cloud_collections (organisation_id, collection_key, updated_at desc);
create index if not exists cloud_collections_customer_idx on public.cloud_collections (organisation_id, customer_source_id) where customer_source_id is not null;
create index if not exists cloud_collections_job_idx on public.cloud_collections (organisation_id, job_source_id) where job_source_id is not null;

alter table public.cloud_collections enable row level security;

drop policy if exists "cloud collections tenant read" on public.cloud_collections;
create policy "cloud collections tenant read" on public.cloud_collections for select to authenticated
using (
  public.is_organisation_member(organisation_id)
  and (
    public.current_jr_role() <> 'customer'
    or customer_source_id = public.current_customer_source_id()
  )
);

drop policy if exists "cloud collections staff insert" on public.cloud_collections;
create policy "cloud collections staff insert" on public.cloud_collections for insert to authenticated
with check (
  public.is_organisation_member(organisation_id)
  and public.current_jr_role() in ('owner','admin','office','electrician')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "cloud collections staff update" on public.cloud_collections;
create policy "cloud collections staff update" on public.cloud_collections for update to authenticated
using (
  public.is_organisation_member(organisation_id)
  and public.current_jr_role() in ('owner','admin','office','electrician')
)
with check (
  public.is_organisation_member(organisation_id)
  and public.current_jr_role() in ('owner','admin','office','electrician')
  and updated_by = auth.uid()
);

drop policy if exists "cloud collections privileged delete" on public.cloud_collections;
create policy "cloud collections privileged delete" on public.cloud_collections for delete to authenticated
using (
  public.is_organisation_member(organisation_id)
  and public.current_jr_role() in ('owner','admin')
);

create trigger cloud_collections_set_updated_at before update on public.cloud_collections
for each row execute function public.set_updated_at();

create trigger cloud_collections_delete_audit after delete on public.cloud_collections
for each row execute function public.audit_jr_entity_change();
