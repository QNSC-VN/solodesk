-- notifications module — transactional outbox pattern (email + in-app).
-- Matches src/db/schema/{notifications,email-outbox}.ts exactly, RLS
-- pattern from 0003 verbatim. See CLAUDE.md's "Notifications" section.

CREATE SCHEMA IF NOT EXISTS notifications;
GRANT USAGE ON SCHEMA notifications TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE notifications.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  type text NOT NULL, -- 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'EINVOICE_THRESHOLD_CROSSED'
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  source_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON notifications.notifications TO solodesk_app;

ALTER TABLE notifications.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON notifications.notifications
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE notifications.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  template_name text NOT NULL,
  template_vars jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed' | 'dead_letter'
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  source_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (tenant_id, source_event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON notifications.email_outbox TO solodesk_app;

ALTER TABLE notifications.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.email_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON notifications.email_outbox
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
