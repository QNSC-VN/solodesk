-- Second Layer A tool (get_stock_level) needs read access to backend-api's
-- catalog schema — same least-privilege, table-by-table GRANT discipline
-- as 0001. Same ordering dependency: backend-api's 0004_catalog_inventory_schema.sql
-- must have already run in this database.

GRANT USAGE ON SCHEMA catalog TO solodesk_agent;
GRANT SELECT ON catalog.skus TO solodesk_agent;
GRANT SELECT ON catalog.lots TO solodesk_agent;
