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

\echo 'JR OS schema-only recovery completed successfully'
