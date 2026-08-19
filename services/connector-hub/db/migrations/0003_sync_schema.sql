-- webhook intake module — matches src/db/schema/webhook-events.ts exactly.

CREATE SCHEMA IF NOT EXISTS sync;
GRANT USAGE ON SCHEMA sync TO solodesk_connector;
ALTER DEFAULT PRIVILEGES IN SCHEMA sync
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_connector;

CREATE TABLE sync.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  -- Dedup guard (docs Section 7: "deduplicate via a unique index on
  -- provider_event_id") — a retried webhook delivery for the same event
  -- hits this and is recognized as already-seen, not double-processed.
  UNIQUE (provider, provider_event_id)
);

ALTER TABLE sync.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync.webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sync.webhook_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
