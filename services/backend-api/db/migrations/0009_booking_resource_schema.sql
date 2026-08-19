-- booking-resource module — matches src/db/schema/{resources,bookings}.ts exactly.

CREATE SCHEMA IF NOT EXISTS booking;
GRANT USAGE ON SCHEMA booking TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA booking
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE booking.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  name text NOT NULL,
  resource_type text NOT NULL,
  capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resources_capacity_positive CHECK (capacity > 0)
);

CREATE TABLE booking.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  resource_id uuid NOT NULL REFERENCES booking.resources(id),
  customer_name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  party_size integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'held',
  hold_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_ends_after_starts CHECK (ends_at > starts_at),
  CONSTRAINT bookings_party_size_positive CHECK (party_size > 0)
);

ALTER TABLE booking.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.resources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON booking.resources
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE booking.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON booking.bookings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Speeds the overlap query every hold/confirm attempt runs (see
-- booking.drizzle-repository.ts's capacityAvailable check).
CREATE INDEX bookings_tenant_resource_time_idx ON booking.bookings (tenant_id, resource_id, starts_at, ends_at);
