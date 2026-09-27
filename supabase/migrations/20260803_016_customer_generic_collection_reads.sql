-- Restrict customer reads from the generic collection table to the small set of
-- customer-facing collections used by the authenticated portal. Matching a
-- customer_source_id alone must not expose internal CRM, finance, settings, or
-- demo access-code records.

drop policy if exists "cloud collections tenant read" on public.cloud_collections;

create policy "cloud collections tenant read" on public.cloud_collections
for select to authenticated
using (
  public.is_organisation_member(organisation_id)
  and (
    public.current_jr_role() <> 'customer'
    or (
      customer_source_id = public.current_customer_source_id()
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
