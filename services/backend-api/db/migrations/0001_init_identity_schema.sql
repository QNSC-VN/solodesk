-- Hand-written to match src/db/schema/*.ts exactly (drizzle-kit generate needs a TTY,
-- so migrations are authored by hand here — same convention as rally).

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  industry text NOT NULL,
  province text NOT NULL DEFAULT 'gia_lai',
  activated_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- `tenants` itself is NOT tenant-scoped RLS — it IS the tenant list, read by
-- onboarding/B2G aggregation as the app role (see 0002). Every OTHER schema's
-- tables (catalog, sales, invoicing, ...) carry a `tenant_id` FK to this table
-- and MUST follow the RLS pattern in 0002's comment block. Do not add a
-- `tenant_id`-based RLS policy here — there is nothing to scope it against.
