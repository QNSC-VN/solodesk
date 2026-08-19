-- returns module — full-order reversal spanning order + invoice + payment +
-- stock. Matches src/db/schema/returns.ts exactly, RLS pattern from 0003
-- verbatim. See CLAUDE.md's "Returns" section.

CREATE TABLE sales.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  order_id uuid NOT NULL REFERENCES sales.orders(id),
  invoice_id uuid NOT NULL REFERENCES tax.invoices(id),
  reason text NOT NULL,
  refund_amount numeric(14, 2) NOT NULL,
  refund_method text, -- only meaningful when refund_amount > 0
  status text NOT NULL DEFAULT 'completed', -- v1: no partial/pending workflow
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON sales.returns TO solodesk_app;

ALTER TABLE sales.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.returns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.returns
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- payment-reconcile: distinguishes a refund from a normal payment so
-- PaymentService.getPaymentSummary stays correct (derived, not stored)
-- after a return — existing rows default to 'payment', backward compatible.
ALTER TABLE payments.payments ADD COLUMN type text NOT NULL DEFAULT 'payment';
