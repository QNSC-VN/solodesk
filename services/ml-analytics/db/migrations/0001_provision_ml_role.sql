-- ============================================================================
-- Same NOSUPERUSER/NOBYPASSRLS provisioning pattern as backend-api's
-- 0002_provision_app_role.sql, connector-hub's 0001_provision_connector_role.sql,
-- and agent-orchestrator's 0001_provision_agent_role.sql — read one of
-- those before touching this file.
--
-- `solodesk_ml`'s boundary is the SAME shape as `solodesk_agent`'s:
-- SELECT-only, granted table-by-table, never INSERT/UPDATE/DELETE. This is
-- the 4th deployable, a genuinely different runtime (Python/FastAPI, not
-- Node) but the SAME shared Postgres database and the SAME
-- public.schema_migrations tracking table as the other 3 — filenames just
-- need to stay distinct across all 4 services' migration directories,
-- same convention already holding for 20+ prior migrations.
--
-- ORDERING DEPENDENCY: GRANTs on sales.orders, which backend-api's own
-- migrations create — this migration must run AFTER backend-api's, in
-- every environment, same as agent-orchestrator's 0001.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solodesk_ml') THEN
    CREATE ROLE solodesk_ml WITH LOGIN PASSWORD :'ml_role_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA sales TO solodesk_ml;
GRANT SELECT ON sales.orders TO solodesk_ml;
