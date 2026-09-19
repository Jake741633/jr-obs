-- Survey-photo metadata and object downloads must resolve to the exact live
-- survey that advertises the photo. Job assignment alone is insufficient:
-- otherwise orphaned metadata, or metadata left behind after survey deletion,
-- remains readable to every electrician assigned to the job.
create or replace function private.jr_field_can_read_survey_photo(
  record_organisation_id uuid,
  record_source_id text,
  record_customer_source_id text,
  record_job_source_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    record_organisation_id = private.current_organisation_id()
    and record_source_id is not null
    and record_job_source_id is not null
    and exists (
      select 1
      from public.cloud_collections survey
      where survey.organisation_id = record_organisation_id
        and survey.collection_key = 'jr-os-surveys'
        and survey.deleted_at is null
        and survey.customer_source_id is not distinct from record_customer_source_id
        and survey.job_source_id is not distinct from record_job_source_id
        and private.jr_field_record_targets_assigned_job(
          survey.organisation_id,
          survey.customer_source_id,
          survey.job_source_id
        )
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(survey.payload -> 'photos') = 'array'
                then survey.payload -> 'photos'
              else '[]'::jsonb
            end
          ) as survey_photo(photo)
          where survey_photo.photo ->> 'id' = record_source_id
        )
    ),
    false
  )
$$;

revoke execute on function private.jr_field_can_read_survey_photo(uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_field_can_read_survey_photo(uuid, text, text, text)
to authenticated, service_role;

-- Both private_files SELECT and authenticated Storage downloads already call
-- this helper. Replacing the five-argument definition updates both boundaries
-- without reopening office-only write permissions.
create or replace function private.jr_can_read_private_file(
  storage_key_value text,
  record_organisation_id uuid,
  record_source_id text,
  customer_source_id_value text,
  job_source_id_value text
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
      and (
        (
          storage_key_value = 'jr-os-job-documents'
          and private.jr_field_can_read_job_document(
            record_organisation_id,
            record_source_id,
            customer_source_id_value,
            job_source_id_value
          )
        )
        or (
          storage_key_value = 'jr-os-surveys'
          and private.jr_field_can_read_survey_photo(
            record_organisation_id,
            record_source_id,
            customer_source_id_value,
            job_source_id_value
          )
        )
      )
    ),
    false
  )
$$;

revoke execute on function private.jr_can_read_private_file(text, uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_can_read_private_file(text, uuid, text, text, text)
to authenticated, service_role;

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration',
    '20260826230416_bind_field_survey_photo_reads.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
