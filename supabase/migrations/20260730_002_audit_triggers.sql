create or replace function public.audit_jr_entity_change()
returns trigger
language plpgsql
security definer set search_path=public
as $$
declare
  action_name text;
  source_value text;
  organisation_value uuid;
  before_value jsonb;
  after_value jsonb;
begin
  if tg_op = 'DELETE' then
    source_value := old.source_id;
    organisation_value := old.organisation_id;
    before_value := to_jsonb(old);
    after_value := null;
    action_name := 'record_deleted';
  else
    source_value := new.source_id;
    organisation_value := new.organisation_id;
    before_value := case when tg_op='INSERT' then null else to_jsonb(old) end;
    after_value := to_jsonb(new);

    if tg_table_name = 'payments' then
      action_name := 'payment_changed';
    elsif tg_table_name = 'pricing_documents'
      and coalesce(old.payload->>'status','') <> 'Accepted'
      and new.payload->>'status' = 'Accepted' then
      action_name := 'quote_approved';
    elsif tg_table_name = 'certificates'
      and coalesce(old.payload->>'status','') <> 'Issued'
      and new.payload->>'status' = 'Issued' then
      action_name := 'certificate_issued';
    else
      return new;
    end if;
  end if;

  insert into public.audit_log (
    organisation_id,
    actor_user_id,
    action,
    entity_table,
    source_id,
    before_data,
    after_data
  ) values (
    organisation_value,
    auth.uid(),
    action_name,
    tg_table_name,
    source_value,
    before_value,
    after_value
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer set search_path=public
as $$
begin
  if tg_op='UPDATE' and (old.role is distinct from new.role or old.active is distinct from new.active or old.customer_source_id is distinct from new.customer_source_id) then
    insert into public.audit_log (organisation_id,actor_user_id,action,entity_table,source_id,before_data,after_data)
    values (new.organisation_id,auth.uid(),'user_permission_changed','profiles',new.id::text,to_jsonb(old),to_jsonb(new));
    return new;
  elsif tg_op='DELETE' then
    insert into public.audit_log (organisation_id,actor_user_id,action,entity_table,source_id,before_data)
    values (old.organisation_id,auth.uid(),'record_deleted','profiles',old.id::text,to_jsonb(old));
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_jr_entity_change() from public, anon, authenticated;
revoke all on function public.audit_profile_change() from public, anon, authenticated;

-- Append-only audit coverage for the requested sensitive actions.
drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.audit_jr_entity_change();

drop trigger if exists pricing_documents_audit on public.pricing_documents;
create trigger pricing_documents_audit after update or delete on public.pricing_documents for each row execute function public.audit_jr_entity_change();

drop trigger if exists certificates_audit on public.certificates;
create trigger certificates_audit after update or delete on public.certificates for each row execute function public.audit_jr_entity_change();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update or delete on public.profiles for each row execute function public.audit_profile_change();

-- Sensitive tables receive deletion logging even where no special update event is required.
do $$
declare t text;
begin
  foreach t in array array['customers','builders','jobs','invoices','expenses','materials','stock_items','stock_movements','purchase_lists','planner_entries','team_members','timesheets','electrical_testing_records','job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_delete_audit',t);
    execute format('create trigger %I after delete on public.%I for each row execute function public.audit_jr_entity_change()',t||'_delete_audit',t);
  end loop;
end $$;
