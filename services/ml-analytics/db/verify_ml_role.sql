-- Run after every migration deploy, every environment. Non-empty result = FAIL THE DEPLOY.
-- Same convention as backend-api's scripts/verify-app-role.sql.
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'solodesk_ml' AND (rolsuper OR rolbypassrls);
