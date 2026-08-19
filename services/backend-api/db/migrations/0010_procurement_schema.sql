-- procurement module — matches src/db/schema/{suppliers,negotiated-prices,purchase-notes,purchase-note-lines}.ts exactly.

CREATE SCHEMA IF NOT EXISTS procurement;
GRANT USAGE ON SCHEMA procurement TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA procurement
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE procurement.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  name text NOT NULL,
  contact_info text,
  tax_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE procurement.negotiated_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  supplier_id uuid NOT NULL REFERENCES procurement.suppliers(id),
  sku_id uuid NOT NULL REFERENCES catalog.skus(id),
  unit_cost numeric(14, 2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE procurement.purchase_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  supplier_id uuid NOT NULL REFERENCES procurement.suppliers(id),
  status text NOT NULL DEFAULT 'recorded',
  total_amount numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE procurement.purchase_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  purchase_note_id uuid NOT NULL REFERENCES procurement.purchase_notes(id),
  sku_id uuid NOT NULL REFERENCES catalog.skus(id),
  lot_id uuid NOT NULL REFERENCES catalog.lots(id),
  quantity numeric(14, 3) NOT NULL,
  unit_cost numeric(14, 2) NOT NULL,
  line_total numeric(14, 2) NOT NULL
);

ALTER TABLE procurement.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.suppliers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.suppliers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE procurement.negotiated_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.negotiated_prices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.negotiated_prices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE procurement.purchase_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.purchase_notes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE procurement.purchase_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_note_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.purchase_note_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Only one ACTIVE (effective_to IS NULL) negotiated price per supplier+SKU —
-- setting a new one must close the old row first, in the same transaction.
CREATE UNIQUE INDEX negotiated_prices_active_idx ON procurement.negotiated_prices (tenant_id, supplier_id, sku_id)
  WHERE effective_to IS NULL;

CREATE INDEX purchase_note_lines_tenant_note_idx ON procurement.purchase_note_lines (tenant_id, purchase_note_id);
