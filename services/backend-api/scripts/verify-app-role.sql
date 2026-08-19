-- Run after every migration deploy, every environment. Non-empty result = FAIL THE DEPLOY.
-- Wire this into the CI migration-gate step (services/backend-api/db/migrate.ts calls it).
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'solodesk_app' AND (rolsuper OR rolbypassrls);
