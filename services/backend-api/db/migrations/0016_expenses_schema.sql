-- expenses module — matches src/db/schema/expenses.ts exactly. Ported
-- from SOLOMATRIX-Mockup-v4's own "Khoản chi" screen (sm-domain.js's
-- addChi/chiSummary) — NOT the same as the mockup's separate, static
-- "Chi phí của tôi" cost-roadmap screen. See CLAUDE.md's "Expense domain"
-- section for the full scope reasoning (why this is genuinely separate
-- from procurement's purchase notes — no SKU/lot linkage, this is
-- non-inventory operating spend).

CREATE SCHEMA IF NOT EXISTS expenses;
GRANT USAGE ON SCHEMA expenses TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA expenses
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

-- `category` is the mockup's own fixed 8-value LOAI_CHI set, validated at
-- the app layer only (class-validator @IsIn) — same closed-union-as-plain-
-- text pattern as sales.orders.status / sales.returns.refund_method, not
-- a reference table (no per-category rate/label data to store, unlike
-- tax.rate_groups).
-- `documentation` mirrors the mockup's chungTu field ('hoa-don'/'phieu-chi'/
-- 'khong') — used to compute a compliance warning (no-documentation spend
-- isn't deductible once the household formalizes), never blocks the write.
-- `supplier_name` is free text, NOT an FK to procurement's real Supplier
-- entity — the mockup's own data model doesn't link them either.
CREATE TABLE expenses.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  documentation text NOT NULL DEFAULT 'khong',
  supplier_name text,
  is_personal_wallet boolean NOT NULL DEFAULT false,
  spent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_positive CHECK (amount > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON expenses.expenses TO solodesk_app;

ALTER TABLE expenses.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses.expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON expenses.expenses
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX expenses_tenant_spent_at_idx ON expenses.expenses (tenant_id, spent_at);
