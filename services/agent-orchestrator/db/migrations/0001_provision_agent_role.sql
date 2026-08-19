-- ============================================================================
-- Same NOSUPERUSER/NOBYPASSRLS provisioning pattern as backend-api's
-- 0002_provision_app_role.sql and connector-hub's
-- 0001_provision_connector_role.sql — read that header before touching this.
--
-- `solodesk_agent`'s boundary is DIFFERENT from connector-hub's: connector-hub
-- must NEVER read backend-api's tenant business tables (security boundary,
-- holds secrets + calls the internet). agent-orchestrator's whole job is
-- ANSWERING QUESTIONS about that business data (docs Section 5.1's Layer A:
-- "the household's own data ... constrained tool-calling ... executed
-- directly against Postgres with app.tenant_id set so RLS enforces
-- automatically") — so it legitimately needs READ access, granted narrowly,
-- table by table, as each Layer A tool needs it. Never INSERT/UPDATE/DELETE.
--
-- ORDERING DEPENDENCY: this migration GRANTs on tables backend-api's own
-- migrations create (identity.tenants, sales.orders) — it must run AFTER
-- backend-api's migrations have already run in this database, in every
-- environment (local dev, CI, prod). Running it first fails loud (42P01
-- relation does not exist), not silently.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solodesk_agent') THEN
    CREATE ROLE solodesk_agent WITH LOGIN PASSWORD :'agent_role_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA identity TO solodesk_agent;
GRANT SELECT ON identity.tenants TO solodesk_agent;

GRANT USAGE ON SCHEMA sales TO solodesk_agent;
GRANT SELECT ON sales.orders TO solodesk_agent;

-- Every future Layer A tool needing another table repeats this GRANT
-- pattern for exactly that table — never a blanket
-- "GRANT SELECT ON ALL TABLES IN SCHEMA" for a schema this role doesn't
-- fully need, matching the least-privilege discipline the rest of this
-- migration establishes.
