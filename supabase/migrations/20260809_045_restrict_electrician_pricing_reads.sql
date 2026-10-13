-- Full pricing documents contain internal costs, markups, profitability,
-- follow-up history and staff-only notes. Route guards already keep electricians
-- out of quote and finance screens, but direct PostgREST reads must enforce the
-- same least-privilege boundary. Customer sessions continue to use the separate
-- allowlisted customer_pricing_documents projection created by migration 042.

drop policy if exists pricing_documents_select on public.pricing_documents;
create policy pricing_documents_select
on public.pricing_documents
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
