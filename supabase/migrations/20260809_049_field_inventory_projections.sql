-- Typed inventory records are field-operational but also contain trade/sell
-- prices. Give electricians projections without cost data, keep the complete
-- source rows office-only for SELECT, and merge field updates so hidden prices
-- survive quantity/description edits.

create table if not exists public.field_materials (
  id uuid primary key references public.materials(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create table if not exists public.field_stock_items (
  id uuid primary key references public.stock_items(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create table if not exists public.field_purchase_lists (
  id uuid primary key references public.purchase_lists(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create index if not exists field_materials_org_updated_idx
on public.field_materials (organisation_id, updated_at desc);
create index if not exists field_stock_items_org_updated_idx
on public.field_stock_items (organisation_id, updated_at desc);
create index if not exists field_purchase_lists_org_updated_idx
on public.field_purchase_lists (organisation_id, updated_at desc);

alter table public.field_materials enable row level security;
alter table public.field_stock_items enable row level security;
alter table public.field_purchase_lists enable row level security;

revoke all privileges on table
  public.field_materials,
  public.field_stock_items,
  public.field_purchase_lists
from public, anon, authenticated, service_role;
grant select on table
  public.field_materials,
  public.field_stock_items,
  public.field_purchase_lists
to authenticated;
grant select, insert, update, delete on table
  public.field_materials,
  public.field_stock_items,
  public.field_purchase_lists
to service_role;

create or replace function private.jr_field_material_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'name', record_payload -> 'name',
    'category', record_payload -> 'category',
    'manufacturer', record_payload -> 'manufacturer',
    'supplier', record_payload -> 'supplier',
    'supplierUrl', record_payload -> 'supplierUrl',
    'stockCode', record_payload -> 'stockCode',
    'unit', record_payload -> 'unit',
    'favourite', record_payload -> 'favourite',
    'notes', record_payload -> 'notes',
    'lastPriceCheckedAt', record_payload -> 'lastPriceCheckedAt',
    'priceSource', record_payload -> 'priceSource',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

create or replace function private.jr_field_stock_item_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'materialId', record_payload -> 'materialId',
    'description', record_payload -> 'description',
    'locationId', record_payload -> 'locationId',
    'quantity', record_payload -> 'quantity',
    'minimumQuantity', record_payload -> 'minimumQuantity',
    'unit', record_payload -> 'unit',
    'stockCode', record_payload -> 'stockCode',
    'supplier', record_payload -> 'supplier',
    'notes', record_payload -> 'notes',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

create or replace function private.jr_field_purchase_list_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'number', record_payload -> 'number',
    'title', record_payload -> 'title',
    'jobId', record_payload -> 'jobId',
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', item -> 'id',
        'materialId', item -> 'materialId',
        'description', item -> 'description',
        'supplier', item -> 'supplier',
        'stockCode', item -> 'stockCode',
        'supplierUrl', item -> 'supplierUrl',
        'quantity', item -> 'quantity',
        'status', item -> 'status'
      )) order by item_ordinality)
      from jsonb_array_elements(
        case
          when jsonb_typeof(record_payload -> 'items') = 'array'
            then record_payload -> 'items'
          else '[]'::jsonb
        end
      ) with ordinality as purchase_item(item, item_ordinality)
    ), '[]'::jsonb),
    'notes', record_payload -> 'notes',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function
  private.jr_field_material_payload(jsonb),
  private.jr_field_stock_item_payload(jsonb),
  private.jr_field_purchase_list_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.jr_merge_field_purchase_list_payload(
  old_payload jsonb,
  new_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select (
    old_payload || private.jr_field_purchase_list_payload(new_payload)
  ) || jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
        coalesce((
          select old_item
          from jsonb_array_elements(
            case
              when jsonb_typeof(old_payload -> 'items') = 'array'
                then old_payload -> 'items'
              else '[]'::jsonb
            end
          ) as existing(old_item)
          where old_item ->> 'id' = new_item ->> 'id'
          limit 1
        ), '{}'::jsonb) || new_item
        order by new_item_ordinality
      )
      from jsonb_array_elements(
        coalesce(private.jr_field_purchase_list_payload(new_payload) -> 'items', '[]'::jsonb)
      ) with ordinality as incoming(new_item, new_item_ordinality)
    ), '[]'::jsonb)
  )
$$;

revoke execute on function private.jr_merge_field_purchase_list_payload(jsonb, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.guard_jr_electrician_inventory_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or private.current_jr_role() <> 'electrician' then
    return new;
  end if;

  if tg_table_name = 'materials' then
    if tg_op = 'INSERT' then
      new.payload := private.jr_field_material_payload(new.payload);
    else
      new.payload := old.payload || private.jr_field_material_payload(new.payload);
    end if;
  elsif tg_table_name = 'stock_items' then
    if tg_op = 'INSERT' then
      new.payload := private.jr_field_stock_item_payload(new.payload);
    else
      new.payload := old.payload || private.jr_field_stock_item_payload(new.payload);
    end if;
  elsif tg_table_name = 'purchase_lists' then
    if tg_op = 'INSERT' then
      new.payload := private.jr_field_purchase_list_payload(new.payload);
    else
      new.payload := private.jr_merge_field_purchase_list_payload(old.payload, new.payload);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_electrician_inventory_payload()
from public, anon, authenticated;
grant execute on function private.guard_jr_electrician_inventory_payload()
to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['materials','stock_items','purchase_lists'] loop
    execute format('drop trigger if exists field_inventory_payload_guard on public.%I', table_name);
    execute format(
      'create trigger field_inventory_payload_guard before insert or update on public.%I for each row execute function private.guard_jr_electrician_inventory_payload()',
      table_name
    );
  end loop;
end
$$;

create or replace function private.refresh_jr_field_inventory_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'materials' then
    if tg_op = 'DELETE' then
      delete from public.field_materials where id = old.id;
      return old;
    end if;
    insert into public.field_materials (
      id, organisation_id, source_id, customer_source_id, job_source_id,
      version, source_updated_at, payload, deleted_at, created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.source_id, new.customer_source_id,
      new.job_source_id, new.version, new.source_updated_at,
      private.jr_field_material_payload(new.payload), new.deleted_at,
      new.created_at, new.updated_at
    )
    on conflict (id) do update set
      organisation_id = excluded.organisation_id,
      source_id = excluded.source_id,
      customer_source_id = excluded.customer_source_id,
      job_source_id = excluded.job_source_id,
      version = excluded.version,
      source_updated_at = excluded.source_updated_at,
      payload = excluded.payload,
      deleted_at = excluded.deleted_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  elsif tg_table_name = 'stock_items' then
    if tg_op = 'DELETE' then
      delete from public.field_stock_items where id = old.id;
      return old;
    end if;
    insert into public.field_stock_items (
      id, organisation_id, source_id, customer_source_id, job_source_id,
      version, source_updated_at, payload, deleted_at, created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.source_id, new.customer_source_id,
      new.job_source_id, new.version, new.source_updated_at,
      private.jr_field_stock_item_payload(new.payload), new.deleted_at,
      new.created_at, new.updated_at
    )
    on conflict (id) do update set
      organisation_id = excluded.organisation_id,
      source_id = excluded.source_id,
      customer_source_id = excluded.customer_source_id,
      job_source_id = excluded.job_source_id,
      version = excluded.version,
      source_updated_at = excluded.source_updated_at,
      payload = excluded.payload,
      deleted_at = excluded.deleted_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  elsif tg_table_name = 'purchase_lists' then
    if tg_op = 'DELETE' then
      delete from public.field_purchase_lists where id = old.id;
      return old;
    end if;
    insert into public.field_purchase_lists (
      id, organisation_id, source_id, customer_source_id, job_source_id,
      version, source_updated_at, payload, deleted_at, created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.source_id, new.customer_source_id,
      new.job_source_id, new.version, new.source_updated_at,
      private.jr_field_purchase_list_payload(new.payload), new.deleted_at,
      new.created_at, new.updated_at
    )
    on conflict (id) do update set
      organisation_id = excluded.organisation_id,
      source_id = excluded.source_id,
      customer_source_id = excluded.customer_source_id,
      job_source_id = excluded.job_source_id,
      version = excluded.version,
      source_updated_at = excluded.source_updated_at,
      payload = excluded.payload,
      deleted_at = excluded.deleted_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

revoke execute on function private.refresh_jr_field_inventory_projection()
from public, anon, authenticated;
grant execute on function private.refresh_jr_field_inventory_projection()
to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['materials','stock_items','purchase_lists'] loop
    execute format('drop trigger if exists field_inventory_projection on public.%I', table_name);
    execute format(
      'create trigger field_inventory_projection after insert or update or delete on public.%I for each row execute function private.refresh_jr_field_inventory_projection()',
      table_name
    );
  end loop;
end
$$;

insert into public.field_materials (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, private.jr_field_material_payload(payload), deleted_at,
  created_at, updated_at
from public.materials
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.field_stock_items (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, private.jr_field_stock_item_payload(payload), deleted_at,
  created_at, updated_at
from public.stock_items
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.field_purchase_lists (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, private.jr_field_purchase_list_payload(payload), deleted_at,
  created_at, updated_at
from public.purchase_lists
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

do $$
declare table_name text;
begin
  foreach table_name in array array['field_materials','field_stock_items','field_purchase_lists'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_electrician_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        deleted_at is null
        and organisation_id = private.current_organisation_id()
        and private.current_jr_role() = ''electrician''
      )',
      table_name || '_electrician_select',
      table_name
    );
  end loop;

  foreach table_name in array array['materials','stock_items','purchase_lists'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        organisation_id = private.current_organisation_id()
        and private.can_manage_office_data()
      )',
      table_name || '_select',
      table_name
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
