-- Persists the real result of POST /v1/connectors/:provider/verify —
-- previously a one-shot check whose outcome was returned over HTTP and
-- then thrown away (confirmed by reading ConnectorVerificationService.
-- verify()'s full body before this change — no repository write existed
-- at all). This is backend gap #4's own narrower v1 slice: a per-tenant
-- "last verified" signal, NOT the mockup's full 12-connector/7-state
-- onboarding machine, freshness-mechanism metadata, or webhook-health
-- tracking — see CLAUDE.md's "Connector status v1" section for the full
-- scope-cut reasoning.

ALTER TABLE vault.credentials ADD COLUMN last_verified_at timestamptz;
ALTER TABLE vault.credentials ADD COLUMN last_verification_ok boolean;
