-- Restrict private storage reads for customer portal sessions.
-- Staff retain organisation-scoped access, while customers may read only object
-- paths linked to private_files metadata for their own customer source ID.

drop policy if exists jr_private_select on storage.objects;
create policy jr_private_select on storage.objects
for select to authenticated
using (
  bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and (
    public.current_role() <> 'customer'
    or exists (
      select 1
      from public.private_files file
      where file.organisation_id = public.current_organisation_id()
        and file.object_path = name
        and file.customer_source_id = (
          select profile.customer_source_id
          from public.profiles profile
          where profile.id = auth.uid()
        )
    )
  )
);
