-- Customer photo sharing is an explicit portal action, but the underlying
-- job-document and Storage policies previously trusted customer scope alone.
-- That allowed a direct Data API or Storage request to bypass the UI's
-- PortalPhotoShare.safeToShare check. Fail closed until a dedicated shared-photo
-- projection can carry that explicit decision through the database boundary.

create or replace function private.jr_can_read_private_file(
  storage_key_value text,
  customer_source_id_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and storage_key_value in ('jr-os-job-documents','jr-os-surveys')
    ),
    false
  )
$$;

revoke execute on function private.jr_can_read_private_file(text,text)
from public, anon;
grant execute on function private.jr_can_read_private_file(text,text)
to authenticated, service_role;

-- Complete job-document rows include internal categories such as RAMS, site
-- notes and material orders. Customers must not query the base table directly.
drop policy if exists job_documents_select on public.job_documents;
create policy job_documents_select
on public.job_documents
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.current_jr_role() in ('owner', 'admin', 'office', 'electrician')
);

-- Portal photo-share records contain the explicit safeToShare decision. Until
-- the customer-safe projection is introduced, do not expose those raw records
-- to customer sessions either; otherwise a false/internal share record can be
-- enumerated directly even though the UI filters it out.
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
        'jr-os-portal-activity',
        'jr-os-deposit-requirements'
      )
    )
  )
);

notify pgrst, 'reload schema';
