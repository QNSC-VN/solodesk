-- This is the REFERENCE PATTERN every future tenant-scoped table copies.
-- `tenant_members` = people inside one household/business (bố mẹ, con cái kế
-- cận, kế toán được uỷ quyền — Section "Identity & Tenant" bounded context).

CREATE TABLE identity.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL, -- 'owner' | 'successor' | 'accountant_delegate' — see TenantMemberRole
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.tenant_members TO solodesk_app;

-- ── The pattern (copy this block verbatim for every new tenant-scoped table) ──

ALTER TABLE identity.tenant_members ENABLE ROW LEVEL SECURITY;
-- FORCE is the part rally's original attempt skipped in spirit (they had the
-- role problem instead, but FORCE is the second independent layer): without
-- it, the table OWNER still bypasses RLS even on a correctly-provisioned
-- non-superuser role, if that role happens to own the table (which a
-- migration-running role typically does).
ALTER TABLE identity.tenant_members FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.tenant_members
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- `current_setting(..., true)` (missing_ok=true) returns NULL instead of
-- raising when `app.tenant_id` was never SET LOCAL for this transaction —
-- NULL = tenant_id is never true for any real row, so an app bug that forgets
-- to set tenant context fails CLOSED (zero rows), not open (all rows).
