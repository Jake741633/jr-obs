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

\echo 'JR OS schema-only recovery completed successfully'
