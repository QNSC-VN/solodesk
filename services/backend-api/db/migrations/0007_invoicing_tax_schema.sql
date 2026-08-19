-- invoicing-tax module — matches src/db/schema/{tax-rules,invoices,invoice-sequences}.ts exactly.

CREATE SCHEMA IF NOT EXISTS tax;
GRANT USAGE ON SCHEMA tax TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tax
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

-- Reference data — NOT tenant-scoped, no RLS. Same rates apply to every
-- tenant; versioned by effective_from/effective_to, never edited in place.
CREATE TABLE tax.tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry text,
  rate numeric(6, 4) NOT NULL,
  annual_revenue_threshold numeric(14, 2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tax.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  order_id uuid NOT NULL REFERENCES sales.orders(id),
  invoice_number text NOT NULL,
  tax_rule_id uuid NOT NULL REFERENCES tax.tax_rules(id),
  subtotal numeric(14, 2) NOT NULL,
  tax_rate numeric(6, 4) NOT NULL,
  tax_amount numeric(14, 2) NOT NULL,
  total_amount numeric(14, 2) NOT NULL,
  requires_e_invoice boolean NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE tax.invoice_sequences (
  tenant_id uuid PRIMARY KEY REFERENCES identity.tenants(id),
  next_number integer NOT NULL DEFAULT 1
);

ALTER TABLE tax.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tax.invoices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE tax.invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.invoice_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tax.invoice_sequences
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX invoices_tenant_issued_at_idx ON tax.invoices (tenant_id, issued_at);

-- Seed rules — illustrative pilot flat rates pending official Tax Dept.
-- confirmation (Section 13's open business decision), NOT verified statutory
-- rates. One row per pilot industry plus a default fallback (industry NULL).
-- annual_revenue_threshold matches the docs' 1-billion-VND/year e-invoice
-- threshold for all rows.
INSERT INTO tax.tax_rules (industry, rate, annual_revenue_threshold, effective_from) VALUES
  ('food_beverage', 0.0450, 1000000000.00, '2026-01-01'),
  ('tourism',       0.0500, 1000000000.00, '2026-01-01'),
  ('agriculture',   0.0150, 1000000000.00, '2026-01-01'),
  (NULL,            0.0300, 1000000000.00, '2026-01-01');
