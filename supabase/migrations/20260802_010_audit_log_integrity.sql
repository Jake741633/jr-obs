-- Preserve the trigger-backed audit log as an organisation-scoped, append-only record.
-- Direct client inserts must identify the authenticated actor and may only use
-- actions appropriate to the caller's active JR OS role.
alter table public.audit_log
  alter column actor_user_id set default auth.uid();

drop policy if exists audit_append on public.audit_log;
create policy audit_append
on public.audit_log
for insert
to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and actor_user_id = auth.uid()
  and (
    (
      action in ('user_permission_changed', 'record_deleted')
      and public.can_manage_business()
    )
    or (
      action in ('quote_approved', 'certificate_issued', 'payment_changed')
      and public.can_manage_field_data()
    )
  )
);

-- No update or delete policies are intentionally created: audit rows remain append-only.
