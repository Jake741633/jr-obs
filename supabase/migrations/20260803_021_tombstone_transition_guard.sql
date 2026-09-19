-- Soft deletes are UPDATE operations, so DELETE policies alone do not protect
-- tombstone creation or restoration. Require owner/admin authority whenever
-- deleted_at changes, and reject pre-deleted inserts from non-privileged roles.

create or replace function public.guard_jr_tombstone_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null and not public.can_manage_business() then
      raise exception 'Only an owner or admin can create a deleted record';
    end if;
  elsif new.deleted_at is distinct from old.deleted_at and not public.can_manage_business() then
    raise exception 'Only an owner or admin can delete or restore records';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_jr_tombstone_transition() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'cloud_collections',
    'customers','builders','jobs','pricing_documents','invoices','payments','expenses',
    'materials','stock_items','stock_movements','purchase_lists','planner_entries',
    'team_members','timesheets','certificates','electrical_testing_records',
    'job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t||'_tombstone_guard', t);
    execute format(
      'create trigger %I before insert or update of deleted_at on public.%I for each row execute function public.guard_jr_tombstone_transition()',
      t||'_tombstone_guard',
      t
    );
  end loop;
end $$;
