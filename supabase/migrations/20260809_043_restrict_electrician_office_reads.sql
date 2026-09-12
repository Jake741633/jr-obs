-- Route guards are presentation controls, not a Data API authorization
-- boundary. Electrician sessions previously matched every non-customer SELECT
-- branch, which exposed office-only finance, CRM history, settings and AI
-- payloads through direct PostgREST queries. Keep office users unrestricted
-- inside their tenant, give electricians an explicit field-operational generic
-- allowlist, and retain
-- the existing customer portal allowlist and row scope.

create or replace function private.can_read_cloud_collection(collection_key_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_jr_role() in ('owner', 'admin', 'office') then true
    when private.current_jr_role() = 'electrician' then collection_key_value = any (array[
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
    else false
  end
$$;

revoke execute on function private.can_read_cloud_collection(text)
from public, anon, authenticated, service_role;
grant execute on function private.can_read_cloud_collection(text)
to authenticated, service_role;

drop policy if exists "cloud collections tenant read"
on public.cloud_collections;
create policy "cloud collections tenant read"
on public.cloud_collections
for select to authenticated
using (
  private.is_organisation_member(organisation_id)
  and (
    private.can_read_cloud_collection(collection_key)
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

-- These typed tables contain office-only business or AI data and have no
-- customer-facing read path.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'expenses',
    'ai_recommendation_evidence'
  ] loop
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

-- Invoice, payment and portal workflow rows remain available to office users
-- and to the exactly matched customer portal account, but not to electricians.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'invoices',
    'payments',
    'portal_approvals',
    'portal_requests'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        organisation_id = private.current_organisation_id()
        and (
          private.can_manage_office_data()
          or (
            private.current_jr_role() = ''customer''
            and customer_source_id = private.current_customer_source_id()
          )
        )
      )',
      table_name || '_select',
      table_name
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
