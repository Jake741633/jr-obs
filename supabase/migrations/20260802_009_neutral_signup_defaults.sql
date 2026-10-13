-- Prevent new independent organisations inheriting JR Electrical Services identity.
-- Existing organisations and profiles are not changed.
create or replace function public.handle_new_jr_os_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organisation_id uuid;
  organisation_name text;
  owner_name text;
begin
  organisation_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');
  owner_name := nullif(trim(new.raw_user_meta_data->>'full_name'), '');

  insert into public.organisations (name)
  values (coalesce(organisation_name, 'New JR OS Business'))
  returning id into new_organisation_id;

  insert into public.profiles (id, organisation_id, full_name, role)
  values (
    new.id,
    new_organisation_id,
    coalesce(owner_name, split_part(coalesce(new.email, 'JR OS Owner'), '@', 1)),
    'owner'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_jr_os_user() from public, anon, authenticated;
