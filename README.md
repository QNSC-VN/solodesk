# SoloDesk

Multi-tenant SaaS platform for the Gia Lai Kế nghiệp số program — see
`docs/ARCHITECTURE.md` (English) / `docs/KIEN-TRUC-GIAI-PHAP.md` (Vietnamese) for
the full solution architecture. This repo is the monorepo (Section 8): one
GitHub repo, multiple independently-deployable services.

## What exists right now

- `services/backend-api` — NestJS + Fastify + Drizzle. Eight domain
  modules, each the hexagonal skeleton (copied from `rally`'s pattern, see
  `docs/ARCHITECTURE.md` Section 17.2): `identity-tenant`,
  `catalog-inventory`, `sales-order`, `invoicing-tax`, `payment-reconcile`,
  `booking-resource`, `procurement`, `traceability` — the full module list
  named in Section 8.
- `services/connector-hub` — NestJS + Fastify + Drizzle, a SEPARATE
  deployable (own Postgres role `solodesk_connector`, GRANTed only on its
  own `vault`/`sync` schemas — see `CLAUDE.md`'s connector-hub section for
  the security-boundary rationale). Credential vault (AES-256-GCM at
  rest), webhook intake with dedup, resilience layer (circuit breaker +
  retry classification, per-provider bulkhead). Five reference connectors
  with real (not live-verified) API shapes: SePay VietQR, GHN, GHTK,
  Shopee, TikTok Shop. The remaining providers Section 8 lists (Lazada,
  ViettelPost, MISA meInvoice, Viettel S-Invoice, VNPT Invoice,
  Booking.com, Agoda, national-free-platform) are scaffolded stubs, not
  fabricated integrations — see `stub-connectors.ts`.
- `services/agent-orchestrator` — a THIRD separate deployable: a real
  Temporal worker (`pnpm worker`, plain script, not NestJS) + a thin
  NestJS HTTP client (`pnpm dev`, starts/signals/queries conversations as
  Temporal workflows). Own Postgres role `solodesk_agent`, SELECT-only on
  exactly the tables its tools need (`identity.tenants`/`sales.orders`/
  `catalog.skus`/`catalog.lots`/`tax.invoices`/`payments.payments`/
  `booking.bookings`/`booking.resources`) — a genuinely different security
  boundary from connector-hub's (READ yes, WRITE no, vs connector-hub's
  NONE at all). Four real Layer A tools (`get_sales_summary`,
  `get_stock_level`, `get_outstanding_invoices`, `get_upcoming_bookings`),
  calling the Anthropic SDK directly — no LiteLLM gateway/Langfuse/RAG
  yet, an explicit scope decision, see CLAUDE.md.
- Postgres RLS + non-superuser app role in ALL THREE services, done FIRST
  and correctly — read `services/backend-api/db/migrations/0002_provision_app_role.sql`,
  `services/connector-hub/db/migrations/0001_provision_connector_role.sql`,
  and `services/agent-orchestrator/db/migrations/0001_provision_agent_role.sql`
  before adding any tenant-scoped table in any service.
- The cross-tenant leak tests (`services/backend-api/test/tenant-isolation.e2e-spec.ts`,
  `services/connector-hub/test/role-isolation.e2e-spec.ts`,
  `services/agent-orchestrator/test/role-isolation.e2e-spec.ts`) must never
  be weakened to make them pass.

- connector-hub's SePay webhook forwards a verified payment straight into
  backend-api's `payment-reconcile` (`POST /internal/payments/by-invoice-number`,
  authenticated by a shared `INTERNAL_SERVICE_TOKEN` secret — an explicit,
  narrow MVP mechanism, not SNS/SQS or a general service-mesh scheme yet).
  Verified end-to-end against two live dev servers — see CLAUDE.md.

Not yet built: `apps/mobile`, `apps/web-*`, `services/ml-analytics`.

## Local dev

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + valkey, shared by all three services
brew install temporal                            # agent-orchestrator only
cp services/backend-api/.env.example services/backend-api/.env
cp services/connector-hub/.env.example services/connector-hub/.env
cp services/agent-orchestrator/.env.example services/agent-orchestrator/.env
# fill in DATABASE_ADMIN_URL / role passwords / VAULT_MASTER_KEY / ANTHROPIC_API_KEY per each .env.example's comments
pnpm install
pnpm --filter @solodesk/backend-api db:migrate
pnpm --filter @solodesk/connector-hub db:migrate
pnpm --filter @solodesk/agent-orchestrator db:migrate   # AFTER backend-api's — see its 0001 migration
pnpm --filter @solodesk/backend-api dev          # :3000
pnpm --filter @solodesk/connector-hub dev        # :3001
temporal server start-dev                        # separate terminal — :7233 gRPC, :8233 Web UI
pnpm --filter @solodesk/agent-orchestrator worker  # separate terminal — the Activity executor
pnpm --filter @solodesk/agent-orchestrator dev     # :3002 — the HTTP client
```

Run the cross-tenant isolation gate locally before touching anything in
`src/platform/tenant-context.ts` or any repository:

```bash
DATABASE_URL=postgres://solodesk_app:<pw>@localhost:5432/solodesk \
  pnpm --filter @solodesk/backend-api test:e2e
```

## Full end-to-end demo

`./scripts/demo-e2e.sh` starts all three services + a real Temporal dev
server and walks the entire business story — onboarding, catalog,
procurement, sales, invoicing, payment, traceability, booking, AI
assistant — as real curl calls against real running servers. Only two
things are mocked (a hand-built SePay webhook payload instead of a real
bank transfer, and the LLM's language understanding, not its data — see
the script's own header comment and CLAUDE.md for exactly what that means
and why). Stop everything afterward with `./scripts/demo-e2e.sh --stop`.

## Conventions

Conventional commits. New env var → `src/config/env.schema.ts` **and**
`.env.example` **and** the CI workflow **and** (once it exists) `infra/live/*`
— same rule rally uses, for the same reason (a var that's real in three places
and forgotten in the fourth fails silently in exactly one of them).
