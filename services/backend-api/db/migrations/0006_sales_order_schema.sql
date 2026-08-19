-- sales-order module — matches src/db/schema/{orders,order-lines}.ts exactly.

CREATE SCHEMA IF NOT EXISTS sales;
GRANT USAGE ON SCHEMA sales TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE sales.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  customer_name text,
  total_amount numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  order_id uuid NOT NULL REFERENCES sales.orders(id),
  sku_id uuid NOT NULL REFERENCES catalog.skus(id),
  lot_id uuid NOT NULL REFERENCES catalog.lots(id),
  quantity numeric(14, 3) NOT NULL,
  -- Snapshot at order time — never re-derived from catalog.skus.unit_price
  -- (Mục 11: "giữ giá đơn treo khi đổi giá sản phẩm").
  unit_price numeric(14, 2) NOT NULL,
  line_total numeric(14, 2) NOT NULL
);

ALTER TABLE sales.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE sales.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.order_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.order_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX order_lines_tenant_order_idx ON sales.order_lines (tenant_id, order_id);
