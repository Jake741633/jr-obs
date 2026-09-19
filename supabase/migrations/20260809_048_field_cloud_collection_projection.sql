-- Electrician-readable generic collections mix operational field data with a
-- small number of private pricing fields (survey labour rates, job-pack rates,
-- variation costs and material usage cost). Route every electrician generic
-- read through one trigger-maintained projection and keep the source table
-- office/customer-only for SELECT.

create table if not exists public.field_cloud_collections (
  id uuid primary key references public.cloud_collections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection_key text not null,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, collection_key, source_id)
);

create index if not exists field_cloud_collections_org_collection_idx
on public.field_cloud_collections (organisation_id, collection_key, updated_at desc);
create index if not exists field_cloud_collections_job_idx
on public.field_cloud_collections (organisation_id, job_source_id)
where job_source_id is not null;

alter table public.field_cloud_collections enable row level security;

revoke all privileges on table public.field_cloud_collections
from public, anon, authenticated, service_role;
grant select on table public.field_cloud_collections to authenticated;
grant select, insert, update, delete on table public.field_cloud_collections to service_role;

create or replace function private.jr_electrician_collection_is_readable(collection_key_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select collection_key_value = any (array[
    'jr-os-surveys',
    'jr-os-rams',
    'jr-os-job-packs',
    'jr-os-job-variations',
    'jr-os-job-timeline',
    'jr-os-site-diaries',
    'jr-os-site-diary',
    'jr-os-job-tasks',
    'jr-os-job-progress',
    'jr-os-job-material-usage',
    'jr-os-job-completion',
    'jr-os-job-qa-inspections',
    'jr-os-stock-locations',
    'jr-os-fleet',
    'jr-os-certificate-defaults'
  ]::text[])
$$;

revoke execute on function private.jr_electrician_collection_is_readable(text)
from public, anon;
grant execute on function private.jr_electrician_collection_is_readable(text)
to authenticated, service_role;

create or replace function private.jr_field_cloud_collection_has_private_fields(collection_key_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select collection_key_value = any (array[
    'jr-os-surveys',
    'jr-os-job-packs',
    'jr-os-job-variations',
    'jr-os-job-material-usage'
  ]::text[])
$$;

revoke execute on function private.jr_field_cloud_collection_has_private_fields(text)
from public, anon, authenticated, service_role;

create or replace function private.jr_field_cloud_payload(collection_key_value text, record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case collection_key_value
    when 'jr-os-surveys' then
      jsonb_strip_nulls(jsonb_build_object(
        'id', record_payload -> 'id',
        'number', record_payload -> 'number',
        'status', record_payload -> 'status',
        'customerId', record_payload -> 'customerId',
        'builderId', record_payload -> 'builderId',
        'jobId', record_payload -> 'jobId',
        'propertyType', record_payload -> 'propertyType',
        'occupancy', record_payload -> 'occupancy',
        'floors', record_payload -> 'floors',
        'bedrooms', record_payload -> 'bedrooms',
        'constructionType', record_payload -> 'constructionType',
        'loftAccess', record_payload -> 'loftAccess',
        'installationAge', record_payload -> 'installationAge',
        'earthingArrangement', record_payload -> 'earthingArrangement',
        'supplyType', record_payload -> 'supplyType',
        'fuseRating', record_payload -> 'fuseRating',
        'cutoutType', record_payload -> 'cutoutType',
        'meterPosition', record_payload -> 'meterPosition',
        'consumerUnitPosition', record_payload -> 'consumerUnitPosition',
        'mainBonding', record_payload -> 'mainBonding',
        'earthingConductorSize', record_payload -> 'earthingConductorSize',
        'consumerUnitManufacturer', record_payload -> 'consumerUnitManufacturer',
        'consumerUnitWays', record_payload -> 'consumerUnitWays',
        'spdFitted', record_payload -> 'spdFitted',
        'rcbosFitted', record_payload -> 'rcbosFitted',
        'rcdType', record_payload -> 'rcdType',
        'spareWays', record_payload -> 'spareWays',
        'consumerUnitCondition', record_payload -> 'consumerUnitCondition',
        'circuits', record_payload -> 'circuits',
        'photos', record_payload -> 'photos',
        'defects', record_payload -> 'defects',
        'risks', record_payload -> 'risks',
        'recommendations', record_payload -> 'recommendations',
        'voiceNotes', record_payload -> 'voiceNotes',
        'surveyNotes', record_payload -> 'surveyNotes',
        'labourHours', record_payload -> 'labourHours',
        'healthScore', record_payload -> 'healthScore',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-packs' then
      jsonb_strip_nulls(jsonb_build_object(
        'id', record_payload -> 'id',
        'name', record_payload -> 'name',
        'category', record_payload -> 'category',
        'description', record_payload -> 'description',
        'labourDescription', record_payload -> 'labourDescription',
        'labourHours', record_payload -> 'labourHours',
        'materials', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', material -> 'id',
            'materialId', material -> 'materialId',
            'description', material -> 'description',
            'quantity', material -> 'quantity'
          )) order by material_ordinality)
          from jsonb_array_elements(
            case
              when jsonb_typeof(record_payload -> 'materials') = 'array'
                then record_payload -> 'materials'
              else '[]'::jsonb
            end
          ) with ordinality as pack_material(material, material_ordinality)
        ), '[]'::jsonb),
        'testingRequirements', record_payload -> 'testingRequirements',
        'certificatesRequired', record_payload -> 'certificatesRequired',
        'notes', record_payload -> 'notes',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-variations' then
      jsonb_strip_nulls(jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'number', record_payload -> 'number',
        'title', record_payload -> 'title',
        'description', record_payload -> 'description',
        'pricingMode', record_payload -> 'pricingMode',
        'status', record_payload -> 'status',
        'approvalMethod', record_payload -> 'approvalMethod',
        'approvalReference', record_payload -> 'approvalReference',
        'requestedBy', record_payload -> 'requestedBy',
        'sentTo', record_payload -> 'sentTo',
        'sentAt', record_payload -> 'sentAt',
        'decidedAt', record_payload -> 'decidedAt',
        'decidedBy', record_payload -> 'decidedBy',
        'photos', record_payload -> 'photos',
        'photoDocumentIds', record_payload -> 'photoDocumentIds',
        'customerNotes', record_payload -> 'customerNotes',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-material-usage' then
      jsonb_strip_nulls(jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'materialId', record_payload -> 'materialId',
        'description', record_payload -> 'description',
        'quantity', record_payload -> 'quantity',
        'unit', record_payload -> 'unit',
        'supplier', record_payload -> 'supplier',
        'usedAt', record_payload -> 'usedAt',
        'recordedBy', record_payload -> 'recordedBy',
        'notes', record_payload -> 'notes',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    else record_payload
  end
$$;

revoke execute on function private.jr_field_cloud_payload(text, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.jr_merge_field_cloud_payload(
  collection_key_value text,
  old_payload jsonb,
  new_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when collection_key_value = 'jr-os-job-packs' then
      (
        old_payload || private.jr_field_cloud_payload(collection_key_value, new_payload)
      ) || jsonb_build_object(
        'materials',
        coalesce((
          select jsonb_agg(
            coalesce((
              select old_material
              from jsonb_array_elements(
                case
                  when jsonb_typeof(old_payload -> 'materials') = 'array'
                    then old_payload -> 'materials'
                  else '[]'::jsonb
                end
              ) as existing(old_material)
              where old_material ->> 'id' = new_material ->> 'id'
              limit 1
            ), '{}'::jsonb) || new_material
            order by new_material_ordinality
          )
          from jsonb_array_elements(
            coalesce(private.jr_field_cloud_payload(collection_key_value, new_payload) -> 'materials', '[]'::jsonb)
          ) with ordinality as incoming(new_material, new_material_ordinality)
        ), '[]'::jsonb)
      )
    else old_payload || private.jr_field_cloud_payload(collection_key_value, new_payload)
  end
$$;

revoke execute on function private.jr_merge_field_cloud_payload(text, jsonb, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.guard_jr_electrician_cloud_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role'
    or private.current_jr_role() <> 'electrician'
    or not private.jr_electrician_collection_is_readable(new.collection_key)
    or not private.jr_field_cloud_collection_has_private_fields(new.collection_key) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.payload := private.jr_field_cloud_payload(new.collection_key, new.payload);
  else
    new.payload := private.jr_merge_field_cloud_payload(new.collection_key, old.payload, new.payload);
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_electrician_cloud_payload()
from public, anon, authenticated;
grant execute on function private.guard_jr_electrician_cloud_payload()
to service_role;

drop trigger if exists cloud_collections_field_payload_guard on public.cloud_collections;
create trigger cloud_collections_field_payload_guard
before insert or update on public.cloud_collections
for each row execute function private.guard_jr_electrician_cloud_payload();

create or replace function private.refresh_jr_field_cloud_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.field_cloud_collections where id = old.id;
    return old;
  end if;

  if not private.jr_electrician_collection_is_readable(new.collection_key) then
    delete from public.field_cloud_collections where id = new.id;
    return new;
  end if;

  insert into public.field_cloud_collections (
    id, organisation_id, collection_key, source_id, customer_source_id,
    job_source_id, version, source_updated_at, payload, deleted_at,
    created_by, updated_by, created_at, updated_at
  ) values (
    new.id, new.organisation_id, new.collection_key, new.source_id,
    new.customer_source_id, new.job_source_id, new.version,
    new.source_updated_at,
    private.jr_field_cloud_payload(new.collection_key, new.payload),
    new.deleted_at, new.created_by, new.updated_by, new.created_at, new.updated_at
  )
  on conflict (id) do update set
    organisation_id = excluded.organisation_id,
    collection_key = excluded.collection_key,
    source_id = excluded.source_id,
    customer_source_id = excluded.customer_source_id,
    job_source_id = excluded.job_source_id,
    version = excluded.version,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    deleted_at = excluded.deleted_at,
    created_by = excluded.created_by,
    updated_by = excluded.updated_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke execute on function private.refresh_jr_field_cloud_collection()
from public, anon, authenticated;
grant execute on function private.refresh_jr_field_cloud_collection()
to service_role;

drop trigger if exists field_cloud_collection_projection on public.cloud_collections;
create trigger field_cloud_collection_projection
after insert or update or delete on public.cloud_collections
for each row execute function private.refresh_jr_field_cloud_collection();

insert into public.field_cloud_collections (
  id, organisation_id, collection_key, source_id, customer_source_id,
  job_source_id, version, source_updated_at, payload, deleted_at,
  created_by, updated_by, created_at, updated_at
)
select
  record.id, record.organisation_id, record.collection_key, record.source_id,
  record.customer_source_id, record.job_source_id, record.version,
  record.source_updated_at,
  private.jr_field_cloud_payload(record.collection_key, record.payload),
  record.deleted_at, record.created_by, record.updated_by,
  record.created_at, record.updated_at
from public.cloud_collections record
where private.jr_electrician_collection_is_readable(record.collection_key)
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  collection_key = excluded.collection_key,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_by = excluded.created_by,
  updated_by = excluded.updated_by,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

drop policy if exists field_cloud_collections_electrician_select
on public.field_cloud_collections;
create policy field_cloud_collections_electrician_select
on public.field_cloud_collections
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
  and private.jr_electrician_collection_is_readable(collection_key)
);

-- Complete generic payloads remain available to office roles and the existing
-- explicitly customer-facing portal collections. Electricians must use the
-- field projection above.
drop policy if exists "cloud collections tenant read"
on public.cloud_collections;
create policy "cloud collections tenant read"
on public.cloud_collections
for select to authenticated
using (
  private.is_organisation_member(organisation_id)
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'customer'
      and customer_source_id = private.current_customer_source_id()
      and collection_key in (
        'jr-os-job-timeline',
        'jr-os-portal-payment-links',
        'jr-os-portal-photo-shares',
        'jr-os-portal-activity',
        'jr-os-deposit-requirements'
      )
    )
  )
);

notify pgrst, 'reload schema';
