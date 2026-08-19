-- Separates "seen" (dedup, already existed) from "successfully forwarded"
-- (the payment event was synced into backend-api). Nullable — set once by
-- WebhookIntakeService.markForwarded after a successful forward call. A
-- redelivered webhook whose forwarded_at is still NULL retries the forward
-- step using the third party's own redelivery as the retry mechanism —
-- there is no internal retry queue yet (see CLAUDE.md's connector-hub
-- section for why this is an honest, explicit MVP choice, not an oversight).
ALTER TABLE sync.webhook_events ADD COLUMN forwarded_at timestamptz;
