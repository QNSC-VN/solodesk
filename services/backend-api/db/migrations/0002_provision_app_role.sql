-- ============================================================================
-- CRITICAL — read Mục 17.2 / Section 17.2 of docs/KIEN-TRUC-GIAI-PHAP.md
-- and docs/ARCHITECTURE.md before touching this file.
--
-- rally implemented Postgres RLS, then ripped it out entirely (migrations
-- 0025/0026 there) after discovering the role the app connected as had
-- SUPERUSER / BYPASSRLS privileges — which makes every `CREATE POLICY` in this
-- codebase a silent no-op. That is NOT a Postgres bug: BYPASSRLS and superuser
-- roles are documented to skip RLS unconditionally, on purpose. The failure
-- was entirely in role provisioning, not in RLS itself.
--
-- This migration is the fix applied BEFORE any tenant-scoped table exists:
-- provision a role the application actually connects as, that is neither
-- superuser nor BYPASSRLS, in EVERY environment including local dev — the
-- docker-compose superuser (`solodesk_superuser`) must never be the app's
-- runtime connection role, not even locally.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solodesk_app') THEN
    CREATE ROLE solodesk_app WITH LOGIN PASSWORD :'app_role_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA identity TO solodesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

-- Every future `CREATE SCHEMA` for a new domain module must repeat the two
-- GRANT statements above for that schema — this is the price of NOT giving
-- solodesk_app blanket superuser-adjacent rights. A schema the app role has
-- no GRANT on will 42501-error, loudly, at migration or first query time —
-- which is the point: a forgotten GRANT is loud, a forgotten role fix
-- (rally's actual failure) was silent for months.

-- Verification query — run this after every deploy, in every environment,
-- and fail the deploy if it returns any row:
--   SELECT rolname FROM pg_roles
--   WHERE rolname = 'solodesk_app' AND (rolsuper OR rolbypassrls);
-- (see scripts/verify-app-role.sql, wired into the CI migration-gate step)
