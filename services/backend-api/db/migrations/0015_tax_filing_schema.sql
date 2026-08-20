-- tax-filing module — matches src/db/schema/{tax-rules,rate-groups,filings,tenants}.ts
-- exactly. See CLAUDE.md's "Tax/filing v1" section for the full scope
-- reasoning (HKD-only, tenant-wide single rate group, no per-SKU
-- granularity, no DN/enterprise regime).

-- The e-invoice threshold (1B/year) already lived here; the 200M/year
-- exemption threshold is the only new value, from the same mockup source
-- as tax.rate_groups below — NOT verified statutory rates, same
-- disclaimer as this table's own original seed comment.
ALTER TABLE tax.tax_rules ADD COLUMN exemption_annual_revenue_threshold numeric(14, 2);
UPDATE tax.tax_rules SET exemption_annual_revenue_threshold = 200000000.00;
ALTER TABLE tax.tax_rules ALTER COLUMN exemption_annual_revenue_threshold SET NOT NULL;

-- Reference data — NOT tenant-scoped, no RLS, same shape as tax.tax_rules.
-- The 4 statutory rate-groups a household-business (HKD) revenue line is
-- classified into — a DIFFERENT axis from TenantIndustry (food_beverage/
-- tourism/agriculture is a business-sector classification; this is the tax
-- code's own revenue-type classification, orthogonal to it). No
-- effective-dating (unlike tax_rules) — this is new data with no history
-- to version yet; add it if a real rate change is ever needed.
-- Rates stored as fractions (0.01 = 1%), matching tax_rules.rate's own
-- convention — NOT the percent-point numbers the mockup source itself
-- uses (SOLOMATRIX-Mockup-v4 js/sm-domain.js TAX.nhom.phanPhoi.gtgt = 1.0
-- meaning 1%). Ported directly from that TAX.nhom constant, itself flagged
-- canDoiChieu — NOT verified against current statute.
CREATE TABLE tax.rate_groups (
  code text PRIMARY KEY,
  name text NOT NULL,
  gtgt_rate numeric(6, 4) NOT NULL,
  tncn_rate numeric(6, 4) NOT NULL,
  is_draft boolean NOT NULL DEFAULT true
);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.rate_groups TO solodesk_app;

INSERT INTO tax.rate_groups (code, name, gtgt_rate, tncn_rate) VALUES
  ('phanPhoi', 'Phân phối, cung cấp hàng hoá',                    0.0100, 0.0050),
  ('sanXuat',  'Sản xuất, vận tải, dịch vụ có gắn với hàng hoá',  0.0300, 0.0150),
  ('dichVu',   'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', 0.0500, 0.0200),
  ('khac',     'Hoạt động kinh doanh khác',                        0.0200, 0.0100);

-- Which single rate-group a household's revenue is classified under, v1's
-- deliberate simplification of the mockup's real per-line/per-SKU
-- attribution chain (line -> SKU -> tenant default -> 'phanPhoi'). NULL =
-- household hasn't set one yet (a real, honest state — never guessed).
-- identity.tenants has no RLS of its own (it IS the tenant list), so this
-- needs no policy work.
ALTER TABLE identity.tenants ADD COLUMN tax_group_default text REFERENCES tax.rate_groups(code);

-- Tenant-scoped — one row per filed quarter, UNIQUE per (tenant, quarter,
-- year) so filing the same quarter twice is a DB-level rejection, not an
-- app-level check (same discipline as every other "can't happen twice"
-- constraint in this schema). receipt_code has no format validation here,
-- matching the mockup's own real behavior — no real eTax API exists yet
-- to validate against.
CREATE TABLE tax.filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  quarter integer NOT NULL,
  year integer NOT NULL,
  receipt_code text NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, quarter, year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.filings TO solodesk_app;

ALTER TABLE tax.filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.filings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tax.filings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
