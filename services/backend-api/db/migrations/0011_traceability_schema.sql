-- traceability module — matches src/db/schema/lot-traces.ts exactly.

CREATE SCHEMA IF NOT EXISTS traceability;
GRANT USAGE ON SCHEMA traceability TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA traceability
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

-- Deliberately NO RLS on this table — see lot-traces.ts's header comment.
-- This is the ONE table in the whole schema designed for a genuinely
-- public, unauthenticated read (GET /v1/trace/:lotId, a buyer's QR scan).
-- A row exists only if a tenant explicitly published it via the
-- authenticated POST /v1/trace/:lotId/publish, which DOES check tenant
-- ownership of the lot before writing.
CREATE TABLE traceability.lot_traces (
  lot_id uuid PRIMARY KEY REFERENCES catalog.lots(id),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  sku_name text NOT NULL,
  sku_category text,
  lot_code text NOT NULL,
  source_channel text,
  supplier_name text,
  received_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
