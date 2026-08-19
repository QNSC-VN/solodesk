-- catalog-inventory module — matches src/db/schema/{skus,lots,stock-movements}.ts
-- exactly, and follows the RLS reference pattern from 0003 verbatim.

CREATE SCHEMA IF NOT EXISTS catalog;
GRANT USAGE ON SCHEMA catalog TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE catalog.skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  sku_code text NOT NULL,
  name text NOT NULL,
  unit text NOT NULL,
  category text,
  unit_price numeric(14, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku_code)
);

CREATE TABLE catalog.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  sku_id uuid NOT NULL REFERENCES catalog.skus(id),
  lot_code text NOT NULL,
  quantity_on_hand numeric(14, 3) NOT NULL,
  quantity_reserved numeric(14, 3) NOT NULL DEFAULT 0,
  source_channel text,
  expires_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lot_code),
  CONSTRAINT lots_quantity_on_hand_nonnegative CHECK (quantity_on_hand >= 0),
  CONSTRAINT lots_quantity_reserved_nonnegative CHECK (quantity_reserved >= 0),
  CONSTRAINT lots_reserved_not_exceed_on_hand CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE TABLE catalog.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  lot_id uuid NOT NULL REFERENCES catalog.lots(id),
  movement_type text NOT NULL,
  quantity numeric(14, 3) NOT NULL,
  reference_type text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── RLS — copy of the 0003 reference pattern, one block per table ──

ALTER TABLE catalog.skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.skus FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.skus
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE catalog.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.lots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.lots
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE catalog.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.stock_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.stock_movements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Hot-path index: available-quantity lookups and FIFO lot selection both
-- filter by (tenant_id, sku_id) and order by received_at.
CREATE INDEX lots_tenant_sku_received_idx ON catalog.lots (tenant_id, sku_id, received_at);
CREATE INDEX stock_movements_tenant_lot_idx ON catalog.stock_movements (tenant_id, lot_id, created_at);
