-- Run after every migration deploy, every environment. Non-empty result = FAIL THE DEPLOY.
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'solodesk_agent' AND (rolsuper OR rolbypassrls);
