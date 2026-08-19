-- ============================================================================
-- Same rationale as backend-api's 0002_provision_app_role.sql — read that
-- file's header before touching this one. `solodesk_connector` is a
-- SEPARATE role from `solodesk_app`, neither superuser nor BYPASSRLS, with
-- GRANT restricted to `vault`/`sync` only. This is the DB-level enforcement
-- of Section 3's "security boundary": only connector-hub's runtime can read
-- the credential vault, and connector-hub's runtime cannot read backend-api's
-- tenant business tables (identity/catalog/sales/tax/payments/booking/
-- procurement/traceability) — it was never GRANTed on those schemas at all.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solodesk_connector') THEN
    CREATE ROLE solodesk_connector WITH LOGIN PASSWORD :'connector_role_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Every future `CREATE SCHEMA` in THIS service must repeat the GRANT
-- pattern for that schema (same discipline as backend-api's migrations) —
-- a forgotten GRANT 42501-errors loudly; a forgotten role fix does not.
