-- messaging module — matches src/db/schema/messages.ts exactly. Ported
-- from SOLOMATRIX-Mockup-v4's "Hội thoại với khách" screen (sm-domain.js's
-- messages/replyMessage): a FLAT customer-message list, no threads —
-- "unread" in the mockup is exactly "not yet replied" (daTraLoi), which
-- this schema models as reply/replied_at staying NULL. Only Zalo carries
-- inbound chat in the mockup's world (marketplace connectors deliver
-- orders, never chat), so `channel` starts with 'zalo' only — a plain
-- text closed union at the app layer, not a reference table.
--
-- `source_event_id` dedups against connector-hub's webhook redelivery:
-- the same provider event forwarded twice resolves to ONE row (the
-- UNIQUE constraint is the backstop; the service checks first for a
-- friendly no-op return, same convention as one-invoice-per-order).

CREATE SCHEMA IF NOT EXISTS messaging;
GRANT USAGE ON SCHEMA messaging TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA messaging
  GRANT SELECT, INSERT, UPDATE ON TABLES TO solodesk_app;

CREATE TABLE messaging.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  channel text NOT NULL,
  direction text NOT NULL,
  customer_name text NOT NULL,
  content text NOT NULL,
  source_event_id text NOT NULL,
  reply text,
  replied_at timestamptz,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messaging_messages_source_unique UNIQUE (tenant_id, source_event_id)
);

GRANT SELECT, INSERT, UPDATE ON messaging.messages TO solodesk_app;

ALTER TABLE messaging.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging.messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging.messages
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX messaging_messages_tenant_created_idx ON messaging.messages (tenant_id, created_at);
