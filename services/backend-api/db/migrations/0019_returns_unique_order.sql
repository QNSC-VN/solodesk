-- DB backstop for the duplicate-return race: two concurrent
-- POST /v1/returns with DIFFERENT idempotency keys both passed the
-- service-level `status === 'confirmed'` check (READ COMMITTED), both
-- credited stock, and both recorded refund payments. The service now
-- flips the order via a guarded UPDATE (WHERE status = 'confirmed'), but
-- the unique index below makes the SAME order un-returnable twice at the
-- storage layer no matter what any future code path does — same
-- "constraint is the real backstop, app check is the fast path"
-- convention as one-invoice-per-order and one-filing-per-quarter.

ALTER TABLE sales.returns
  ADD CONSTRAINT returns_order_unique UNIQUE (tenant_id, order_id);
