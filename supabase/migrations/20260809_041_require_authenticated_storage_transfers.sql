-- Supabase signed URLs are bearer credentials that remain valid until their
-- expiry even after the issuing Auth session is revoked. Require JR OS file
-- traffic to use authenticated Storage operations so newly initiated transfers
-- recheck the live session, profile, role, tenant and customer scope through RLS.
-- Previously issued signed download URLs use Supabase's independent Storage
-- signing key and require key rotation through Supabase Support to revoke early.

do $$
begin
  if to_regprocedure('storage.allow_only_operation(text)') is null
    or to_regprocedure('storage.allow_any_operation(text[])') is null then
    raise exception 'The installed Supabase Storage version does not expose operation-aware RLS helpers';
  end if;
end
$$;

drop policy if exists jr_private_select on storage.objects;
create policy jr_private_select on storage.objects
for select to authenticated
using (
  bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and (
    (
      storage.allow_only_operation('storage.object.get_authenticated')
      and (
        private.current_jr_role() <> 'customer'
        or exists (
          select 1
          from public.private_files file
          where file.organisation_id = private.current_organisation_id()
            and file.bucket = 'jr-os-private'
            and file.object_path = name
            and file.customer_source_id = private.current_customer_source_id()
        )
      )
    )
    or (
      storage.allow_only_operation('storage.object.upload_update')
      and private.can_manage_field_data()
    )
  )
);

drop policy if exists jr_private_insert on storage.objects;
create policy jr_private_insert on storage.objects
for insert to authenticated
with check (
  storage.allow_only_operation('storage.object.upload')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

drop policy if exists jr_private_update on storage.objects;
create policy jr_private_update on storage.objects
for update to authenticated
using (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
)
with check (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

drop policy if exists jr_private_delete on storage.objects;
create policy jr_private_delete on storage.objects
for delete to authenticated
using (
  storage.allow_only_operation('storage.object.delete')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_business()
);

drop policy if exists legacy_files_staff_select on storage.objects;
create policy legacy_files_staff_select on storage.objects
for select to authenticated
using (
  storage.allow_any_operation(array[
    'storage.object.get_authenticated',
    'storage.object.upload_update'
  ]::text[])
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

drop policy if exists legacy_files_staff_insert on storage.objects;
create policy legacy_files_staff_insert on storage.objects
for insert to authenticated
with check (
  storage.allow_only_operation('storage.object.upload')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

drop policy if exists legacy_files_staff_update on storage.objects;
create policy legacy_files_staff_update on storage.objects
for update to authenticated
using (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
)
with check (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

drop policy if exists legacy_files_admin_delete on storage.objects;
create policy legacy_files_admin_delete on storage.objects
for delete to authenticated
using (
  storage.allow_only_operation('storage.object.delete')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_business()
);

-- A signed-upload bearer token minted before this migration can otherwise be
-- used until its independent Storage expiry. Reject that operation in a table
-- trigger as well as preventing issuance through the RLS policies above.
create or replace function private.reject_jr_signed_storage_upload()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bucket_id in ('jr-os-private', 'jr-os-files')
    and storage.allow_only_operation('storage.object.upload_signed') then
    raise exception 'JR OS signed Storage uploads are disabled; use an authenticated upload'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.reject_jr_signed_storage_upload()
from public, anon, authenticated;
grant execute on function private.reject_jr_signed_storage_upload()
to service_role;

drop trigger if exists jr_storage_reject_signed_upload on storage.objects;
create trigger jr_storage_reject_signed_upload
before insert or update on storage.objects
for each row execute function private.reject_jr_signed_storage_upload();

notify pgrst, 'reload schema';
