-- Third Layer A tool (get_outstanding_invoices) needs read access to
-- backend-api's tax and payments schemas — same least-privilege,
-- table-by-table GRANT discipline as 0001/0002. Same ordering dependency:
-- backend-api's 0006_sales_order_schema.sql / invoicing-tax / payment-reconcile
-- migrations must have already run in this database.

GRANT USAGE ON SCHEMA tax TO solodesk_agent;
GRANT SELECT ON tax.invoices TO solodesk_agent;

GRANT USAGE ON SCHEMA payments TO solodesk_agent;
GRANT SELECT ON payments.payments TO solodesk_agent;
