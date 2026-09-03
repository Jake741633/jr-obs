-- JR OS schema-only recovery script.
-- Run with psql from the repository's supabase/recovery directory after
-- supabase/schema.sql has already been applied successfully.
-- Example: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/recovery/after_schema_only.sql

\set ON_ERROR_STOP on

\echo 'Applying JR OS prerequisite helpers'
\ir ../migrations/20260730_000_prerequisite_helpers.sql

\echo 'Applying JR OS cloud foundation'
\ir ../migrations/20260730_001_cloud_foundation.sql

\echo 'Applying JR OS audit triggers'
\ir ../migrations/20260730_002_audit_triggers.sql

\echo 'Applying JR OS permission hardening'
\ir ../migrations/20260730_003_permission_hardening.sql

\echo 'Applying JR OS generic collection sync'
\ir ../migrations/20260731_004_generic_collection_sync.sql

\echo 'Applying JR OS security readiness phase 1'
\ir ../migrations/20260731_005_security_readiness_phase1.sql

\echo 'Applying JR OS profile RLS recursion fix'
\ir ../migrations/20260731_006_profiles_rls_recursion_fix.sql

\echo 'Applying JR OS profile self-update guard'
\ir ../migrations/20260801_007_profile_self_update_guard.sql

\echo 'Applying JR OS private signed-upload controls'
\ir ../migrations/20260801_008_private_storage_signed_uploads.sql

\echo 'Applying JR OS neutral signup defaults'
\ir ../migrations/20260802_009_neutral_signup_defaults.sql

\echo 'Applying JR OS audit-log integrity controls'
\ir ../migrations/20260802_010_audit_log_integrity.sql

\echo 'Applying JR OS generic collection role guard'
\ir ../migrations/20260803_011_generic_collection_role_guard.sql

\echo 'Applying JR OS private storage customer scope'
\ir ../migrations/20260803_012_private_storage_customer_scope.sql

\echo 'Applying JR OS customer profile visibility'
\ir ../migrations/20260803_013_customer_profile_visibility.sql

\echo 'Applying JR OS legacy storage staff reads'
\ir ../migrations/20260803_014_legacy_storage_staff_reads.sql

\echo 'Applying JR OS private metadata delete guard'
\ir ../migrations/20260803_015_private_file_metadata_delete_guard.sql

\echo 'Applying JR OS customer generic collection reads'
\ir ../migrations/20260803_016_customer_generic_collection_reads.sql

\echo 'Applying JR OS customer typed-table reads'
\ir ../migrations/20260803_017_customer_typed_table_reads.sql

\echo 'Applying JR OS customer portal insert guard'
\ir ../migrations/20260803_018_customer_portal_insert_guard.sql

\echo 'Applying JR OS typed insert actor guard'
\ir ../migrations/20260803_019_typed_insert_actor_guard.sql

\echo 'Applying JR OS legacy aggregate read scope'
\ir ../migrations/20260803_020_legacy_app_records_staff_reads.sql

\echo 'Applying JR OS tombstone transition guard'
\ir ../migrations/20260803_021_tombstone_transition_guard.sql

\echo 'Applying JR OS migration marker delete guard'
\ir ../migrations/20260803_022_migration_marker_delete_guard.sql

\echo 'Applying JR OS private file identity guard'
\ir ../migrations/20260803_023_private_file_identity_guard.sql

\echo 'Applying JR OS cloud record identity guard'
\ir ../migrations/20260803_024_cloud_record_identity_guard.sql

\echo 'Applying JR OS legacy record identity guard'
\ir ../migrations/20260803_025_legacy_app_record_identity_guard.sql

\echo 'Applying JR OS migration marker identity guard'
\ir ../migrations/20260803_026_migration_marker_identity_guard.sql

\echo 'Applying JR OS legacy backup office scope'
\ir ../migrations/20260809_027_legacy_backup_office_scope.sql

\echo 'Applying JR OS customer portal job binding'
\ir ../migrations/20260809_028_customer_portal_job_binding.sql

\echo 'Applying JR OS consolidated private file metadata policies'
\ir ../migrations/20260809_029_consolidate_private_file_policies.sql

\echo 'Moving JR OS authorization helpers behind the Data API boundary'
\ir ../migrations/20260809_030_private_authorization_helpers.sql

\echo 'Applying least-privilege public database grants'
\ir ../migrations/20260809_031_public_grant_least_privilege.sql

\echo 'Constraining legacy private-storage uploads'
\ir ../migrations/20260809_032_constrain_legacy_storage_uploads.sql

\echo 'Auditing sensitive metadata deletions'
\ir ../migrations/20260809_033_audit_sensitive_metadata_deletions.sql

\echo 'Guarding customer portal record bindings'
\ir ../migrations/20260809_034_guard_portal_record_bindings.sql

\echo 'Preventing private-file metadata path aliases'
\ir ../migrations/20260809_035_private_file_object_path_uniqueness.sql

\echo 'Guarding private-file customer and job bindings'
\ir ../migrations/20260809_036_guard_private_file_record_bindings.sql

\echo 'Rejecting revoked Supabase sessions in tenant authorization'
\ir ../migrations/20260809_037_enforce_active_auth_sessions.sql

\echo 'Rejecting recovery and verification-only sessions from business data'
\ir ../migrations/20260809_038_restrict_verification_only_sessions.sql

\echo 'Validating cloud payload and customer/job record bindings'
\ir ../migrations/20260809_039_guard_cloud_record_bindings.sql

\echo 'Enforcing the owner and admin profile-management hierarchy'
\ir ../migrations/20260809_040_enforce_profile_management_hierarchy.sql

\echo 'Requiring live authenticated transfers for private Storage'
\ir ../migrations/20260809_041_require_authenticated_storage_transfers.sql

\echo 'Protecting staff-only pricing details from customer sessions'
\ir ../migrations/20260809_042_protect_customer_pricing_details.sql

\echo 'Restricting electrician reads to field-operational records'
\ir ../migrations/20260809_043_restrict_electrician_office_reads.sql

\echo 'Restricting authentication profile directory reads to account managers'
\ir ../migrations/20260809_044_restrict_profile_directory_reads.sql

\echo 'Restricting full pricing document reads to office roles'
\ir ../migrations/20260809_045_restrict_electrician_pricing_reads.sql

\echo 'Projecting a field-safe team directory for electricians'
\ir ../migrations/20260809_046_field_team_member_projection.sql

\echo 'Projecting role-safe job records for field and customer sessions'
\ir ../migrations/20260809_047_job_role_projections.sql

\echo 'Projecting sanitised generic field collections for electricians'
\ir ../migrations/20260809_048_field_cloud_collection_projection.sql

\echo 'Projecting price-safe typed inventory records for electricians'
\ir ../migrations/20260809_049_field_inventory_projections.sql

\echo 'Removing field-visible material price-check metadata'
\ir ../migrations/20260809_050_restrict_field_material_price_metadata.sql

\echo 'Projecting role-safe customer contact records'
\ir ../migrations/20260809_051_customer_role_projections.sql

\echo 'Projecting a field-safe builder directory'
\ir ../migrations/20260809_052_field_builder_projection.sql

\echo 'Scoping field timesheet reads and updates to their creator'
\ir ../migrations/20260809_053_timesheet_actor_scope.sql

\echo 'Binding field timesheets to the authenticated team identity'
\ir ../migrations/20260809_054_bind_timesheets_to_team_identity.sql

\echo 'Scoping field planner entries to assigned team members'
\ir ../migrations/20260809_055_planner_team_scope.sql

\echo 'Scoping private files and Storage objects to their source collection'
\ir ../migrations/20260809_056_private_file_role_scope.sql

\echo 'Projecting issued-only certificate records for customer sessions'
\ir ../migrations/20260809_057_customer_issued_certificate_projection.sql

\echo 'Failing closed raw customer photo and job-document access'
\ir ../migrations/20260809_058_fail_closed_customer_photo_sharing.sql

\echo 'Projecting customer-safe invoice records'
\ir ../migrations/20260809_059_customer_invoice_projection.sql

\echo 'Projecting customer-safe payment records'
\ir ../migrations/20260809_060_customer_payment_projection.sql

\echo 'Guarding customer portal approval evidence'
\ir ../migrations/20260810160830_guard_portal_approval_evidence.sql

\echo 'Restricting profile and permission audit history to account managers'
\ir ../migrations/20260810_061_restrict_profile_audit_reads.sql

\echo 'Guarding customer portal workflow targets'
\ir ../migrations/20260810_062_guard_portal_target_bindings.sql

\echo 'Installing current planner team assignment lifecycle guards'
-- Migration 064 is a self-contained replacement for 063. Replaying 063 here
-- would reject valid completed/cancelled history whose team member is archived.
\ir ../migrations/20260810_064_preserve_planner_history_team_lifecycle.sql

\echo 'Publishing the deployed JR OS migration version'
\ir ../migrations/20260810_065_publish_deployed_migration_version.sql

\echo 'Binding customer portal payment links and publishing the current migration version'
\ir ../migrations/20260810_066_bind_portal_payment_links.sql

\echo 'Projecting customer-safe job timeline records'
\ir ../migrations/20260810_067_customer_timeline_projection.sql

\echo 'Hiding unsent customer pricing drafts'
\ir ../migrations/20260811_068_hide_customer_draft_pricing.sql

\echo 'Revoking portal access when a customer is deleted'
\ir ../migrations/20260813215116_revoke_deleted_customer_portals.sql

\echo 'Making customer portal approval decisions atomic'
begin;
\ir ../migrations/20260813222646_make_portal_approval_atomic.sql
commit;

\echo 'Removing commercial notes from field job and timeline projections'
begin;
\ir ../migrations/20260813230319_protect_field_job_confidentiality.sql
commit;

\echo 'Installing the secure assigned-field mutation boundary'
begin;
\ir ../migrations/20260813235633_secure_field_mutation_boundary.sql
commit;

\echo 'Projecting customer-safe portal finance records'
begin;
\ir ../migrations/20260814091500_project_customer_portal_finance.sql
commit;

\echo 'Securing assigned field job progress updates'
begin;
\ir ../migrations/20260814114500_secure_field_job_progress_updates.sql
commit;

\echo 'Scoping field survey and photo reads to assigned jobs'
begin;
\ir ../migrations/20260820130000_scope_field_survey_reads_to_assignments.sql
commit;

\echo 'Scoping field job reads to assigned jobs'
begin;
\ir ../migrations/20260820143000_scope_field_job_reads_to_assignments.sql
commit;

\echo 'Scoping field customer reads to customers of assigned jobs'
begin;
\ir ../migrations/20260820150000_scope_field_customer_reads_to_assignments.sql
commit;

\echo 'Scoping field job-document and private-file reads to assigned jobs'
begin;
\ir ../migrations/20260820153000_scope_field_job_document_reads_to_assignments.sql
commit;

\echo 'Scoping field timeline reads to assigned jobs'
begin;
\ir ../migrations/20260820160000_scope_field_timeline_reads_to_assignments.sql
commit;

\echo 'Scoping current and legacy field site-diary reads to assigned jobs'
begin;
\ir ../migrations/20260820163000_scope_field_site_diary_reads_to_assignments.sql
commit;

\echo 'Preserving bounded field site-diary progress detail'
begin;
\ir ../migrations/20260820170000_preserve_field_site_diary_progress.sql
commit;

\echo 'Scoping field job-variation reads to assigned jobs'
begin;
\ir ../migrations/20260826101908_scope_field_variation_reads_to_assignments.sql
commit;

\echo 'Scoping field job-progress reads to assigned jobs'
begin;
\ir ../migrations/20260826104958_scope_field_job_progress_reads_to_assignments.sql
commit;

\echo 'Scoping field material-usage reads to assigned jobs'
begin;
\ir ../migrations/20260826110301_scope_field_material_usage_reads_to_assignments.sql
commit;

\echo 'Aligning assigned field progress updates with null-customer envelopes'
begin;
\ir ../migrations/20260826112805_align_field_progress_update_customer_envelopes.sql
commit;

\echo 'Scoping field job-task reads to assigned jobs'
begin;
\ir ../migrations/20260826114300_scope_field_job_task_reads_to_assignments.sql
commit;

\echo 'Scoping field job-QA inspection reads to assigned jobs'
begin;
\ir ../migrations/20260826120037_scope_field_job_qa_reads_to_assignments.sql
commit;

\echo 'Keeping canonical job-completion evidence office-only'
begin;
\ir ../migrations/20260826121246_keep_field_completion_records_office_only.sql
commit;

\echo 'Keeping field invoice, payment and deposit timeline activity office-only'
begin;
\ir ../migrations/20260826123514_hide_field_finance_timeline_activity.sql
commit;

\echo 'Scoping field builder contact reads to assigned jobs'
begin;
\ir ../migrations/20260826132500_scope_field_builder_reads_to_assignments.sql
commit;

\echo 'Keeping field job payment progress and office suggestions private'
begin;
\ir ../migrations/20260826144606_redact_field_job_progress_finance.sql
commit;

\echo 'Binding field survey-photo reads to live canonical surveys'
begin;
\ir ../migrations/20260826230416_bind_field_survey_photo_reads.sql
commit;

\echo 'Binding field mutation receipt replays to live job assignments'
begin;
\ir ../migrations/20260826233120_revalidate_field_mutation_replays.sql
commit;

\echo 'Keeping canonical RAMS records office-only'
begin;
\ir ../migrations/20260827001445_keep_field_rams_office_only.sql
commit;

\echo 'Keeping canonical certificate records office-only'
begin;
\ir ../migrations/20260903104633_keep_field_certificates_office_only.sql
commit;

\echo 'Keeping canonical electrical testing records office-only'
begin;
\ir ../migrations/20260903121755_keep_field_electrical_testing_office_only.sql
commit;

\echo 'Keeping canonical stock movement history office-only'
begin;
\ir ../migrations/20260903132756_keep_field_stock_movements_office_only.sql
commit;

\echo 'Scoping field purchase-list reads to assigned jobs'
begin;
\ir ../migrations/20260903141000_scope_field_purchase_list_reads_to_assignments.sql
commit;

\echo 'JR OS schema-only recovery completed successfully'
