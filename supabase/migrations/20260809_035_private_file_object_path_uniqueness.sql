-- Customer Storage reads are authorized by an exact private_files.object_path
-- match. A stored object must therefore have only one metadata ownership scope;
-- otherwise a second row can alias the object to a different customer.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.private_files'::regclass
      and conname = 'private_files_bucket_object_path_key'
      and contype = 'u'
  ) then
    if exists (
      select 1
      from public.private_files
      group by bucket, object_path
      having count(*) > 1
    ) then
      raise exception 'Cannot secure private-file object paths while duplicate metadata aliases exist';
    end if;

    alter table public.private_files
      add constraint private_files_bucket_object_path_key
      unique (bucket, object_path);
  end if;
end
$$;

notify pgrst, 'reload schema';
