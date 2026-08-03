-- Stable cloud identities must not be rewritten after insert. Allowing an
-- update to change tenant, source, collection or creator identity can move a
-- record between logical entities while bypassing normal create/delete flows.

create or replace function public.guard_jr_record_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is distinct from old.organisation_id
    or new.source_id is distinct from old.source_id
    or new.created_by is distinct from old.created_by then
    raise exception 'Cloud record identity fields are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.guard_jr_collection_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is distinct from old.organisation_id
    or new.collection_key is distinct from old.collection_key
    or new.source_id is distinct from old.source_id
    or new.created_by is distinct from old.created_by then
    raise exception 'Cloud collection identity fields are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_jr_record_identity() from public, anon, authenticated;
revoke all on function public.guard_jr_collection_identity() from public, anon, authenticated;

drop trigger if exists cloud_collections_identity_guard on public.cloud_collections;
create trigger cloud_collections_identity_guard
before update on public.cloud_collections
for each row execute function public.guard_jr_collection_identity();

do $$
declare t text;
begin
  foreach t in array array[
    'customers','builders','jobs','pricing_documents','invoices','payments','expenses',
    'materials','stock_items','stock_movements','purchase_lists','planner_entries',
    'team_members','timesheets','certificates','electrical_testing_records',
    'job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t||'_identity_guard', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.guard_jr_record_identity()',
      t||'_identity_guard',
      t
    );
  end loop;
end $$;
