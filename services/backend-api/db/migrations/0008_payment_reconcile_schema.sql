-- payment-reconcile module — matches src/db/schema/payments.ts exactly.

CREATE SCHEMA IF NOT EXISTS payments;
GRANT USAGE ON SCHEMA payments TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA payments
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE payments.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  invoice_id uuid NOT NULL REFERENCES tax.invoices(id),
  method text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  reference_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments.payments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX payments_tenant_invoice_idx ON payments.payments (tenant_id, invoice_id);

-- Dedup guard for retried bank/QR/marketplace webhook relays (docs Section 7:
-- "deduplicate via a unique index on provider_event_id"). Cash payments have
-- no reference_code, so the index is partial — NULLs never collide.
CREATE UNIQUE INDEX payments_tenant_reference_code_idx ON payments.payments (tenant_id, reference_code)
  WHERE reference_code IS NOT NULL;
