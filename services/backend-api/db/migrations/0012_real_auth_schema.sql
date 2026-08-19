-- Real login (Section 11's pre-pilot gap): password + Google signup/signin,
-- email verification, password reset. None of these 5 tables are RLS-scoped
-- — same "global identity data" shape as identity.tenants, not
-- identity.tenant_members — see CLAUDE.md's "AI-guided onboarding" /
-- "Real login" sections for the full design.

CREATE TABLE identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text, -- null for a Google-only account
  display_name text NOT NULL,
  avatar_url text,
  status text NOT NULL DEFAULT 'active', -- 'invited' | 'active' | 'inactive' | 'suspended'
  email_verified boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'vi-VN',
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  phone text,
  session_version integer NOT NULL DEFAULT 0,
  last_login_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.users TO solodesk_app;

CREATE TABLE identity.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id uuid, -- the tenant id this session is scoped to; opaque to @qnsc-vn/identity
  user_id uuid NOT NULL REFERENCES identity.users(id),
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  is_revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sso_provider text, -- 'google' for an SSO session; null for password
  csrf_token text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.auth_sessions TO solodesk_app;

CREATE TABLE identity.sso_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  provider text NOT NULL,
  provider_sub text NOT NULL,
  provider_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.sso_identities TO solodesk_app;

CREATE TABLE identity.auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  -- Set only for 'email_verify' tokens (created at signup, when the tenant
  -- is already known) — lets verify-email auto-mint a session with no
  -- tenant lookup needed. Null for 'password_reset' (doesn't need one).
  tenant_id uuid REFERENCES identity.tenants(id),
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL, -- 'email_verify' | 'password_reset'
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.auth_tokens TO solodesk_app;

-- Deliberately denormalized, NO RLS — same pattern as
-- traceability.lot_traces. tenant_members is correctly RLS-scoped, which
-- means it cannot be queried by user_id alone before any tenant context
-- exists. Real login needs exactly that (Google login for a RETURNING
-- user, resolving which tenant they belong to before one can be
-- established) — this index answers only that question, maintained
-- alongside tenant_members in the same transaction, no RLS bypass anywhere.
CREATE TABLE identity.user_tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_tenant_memberships TO solodesk_app;

CREATE TABLE identity.auth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text, -- generic string per @qnsc-vn/identity's IAuditService port, not a FK
  resource_type text, -- 'session' | 'user'
  resource_id text,
  user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.auth_audit_log TO solodesk_app;
