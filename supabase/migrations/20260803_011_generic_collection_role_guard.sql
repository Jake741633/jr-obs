-- Restrict generic collection writes by collection sensitivity.
-- Typed tables already have role-specific policies; this guard covers every
-- remaining jr-os-* collection stored in public.cloud_collections.

create or replace function public.can_write_cloud_collection(collection_key_value text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.current_jr_role() in ('owner','admin','office') then true
    when public.current_jr_role() = 'electrician' then collection_key_value = any (array[
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
      'jr-os-job-completion'
    ]::text[])
    else false
  end;
$$;

revoke all on function public.can_write_cloud_collection(text) from public, anon;
grant execute on function public.can_write_cloud_collection(text) to authenticated;

drop policy if exists "cloud collections staff insert" on public.cloud_collections;
create policy "cloud collections staff insert" on public.cloud_collections for insert to authenticated
with check (
  public.is_organisation_member(organisation_id)
  and public.can_write_cloud_collection(collection_key)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "cloud collections staff update" on public.cloud_collections;
create policy "cloud collections staff update" on public.cloud_collections for update to authenticated
using (
  public.is_organisation_member(organisation_id)
  and public.can_write_cloud_collection(collection_key)
)
with check (
  public.is_organisation_member(organisation_id)
  and public.can_write_cloud_collection(collection_key)
  and updated_by = auth.uid()
);
