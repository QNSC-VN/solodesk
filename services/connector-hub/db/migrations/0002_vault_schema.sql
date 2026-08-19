-- vault module — matches src/db/schema/credentials.ts exactly.
--
-- `tenant_id` here is a PLAIN uuid, NOT a foreign key into backend-api's
-- `identity.tenants` — connector-hub is a separate deployable with its own
-- Postgres role (`solodesk_connector`, granted nothing on backend-api's
-- schemas), so a cross-schema FK would create exactly the coupling the two
-- services being separately deployable is supposed to avoid. Referential
-- integrity for `tenant_id` is an application-level concern here, same as
-- any two independently-deployed services referencing each other's IDs.

CREATE SCHEMA IF NOT EXISTS vault;
GRANT USAGE ON SCHEMA vault TO solodesk_connector;
ALTER DEFAULT PRIVILEGES IN SCHEMA vault
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_connector;

CREATE TABLE vault.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  -- AES-256-GCM ciphertext + nonce + auth tag — see
  -- platform/crypto/encryption.service.ts. Plaintext credentials never
  -- touch disk; the plaintext JSON payload exists only in process memory
  -- for the duration of a request.
  encrypted_payload bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

ALTER TABLE vault.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vault.credentials
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Deliberately NO RLS — same "narrow, deliberately public-lookup-safe
-- projection" design as backend-api's traceability.lot_traces. An inbound
-- webhook (SePay etc.) arrives with NO tenant JWT and no SoloDesk session;
-- this table's ONLY job is resolving an unguessable `token` (the tenant's
-- webhook URL segment) to a `(tenant_id, provider)` pair so the handler can
-- then `runWithTenant()` and query `vault.credentials` normally. It holds
-- NO secret material — knowing a token reveals only which tenant+provider
-- it maps to, never the credential itself.
CREATE TABLE vault.webhook_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);
