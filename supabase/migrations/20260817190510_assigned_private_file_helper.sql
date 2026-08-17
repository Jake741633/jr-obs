-- Reintroduce field private-file access only through the immutable job/customer
-- envelope and the authenticated electrician's active job assignment.

create or replace function private.jr_field_can_access_private_file(
  record_organisation_id uuid,
  record_customer_source_id text,
  record_job_source_id text,
  storage_key_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_jr_role() = 'electrician'
    and storage_key_value in ('jr-os-job-documents', 'jr-os-surveys')
    and record_job_source_id is not null
    and private.jr_field_record_targets_assigned_job(
      record_organisation_id,
      record_customer_source_id,
      record_job_source_id
    ),
    false
  )
$$;

revoke execute on function private.jr_field_can_access_private_file(uuid,text,text,text)
from public, anon;
grant execute on function private.jr_field_can_access_private_file(uuid,text,text,text)
to authenticated, service_role;
