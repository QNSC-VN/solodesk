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
  retry classification, per-provider bulkhead). Six reference connectors
  with real (not live-verified) API shapes: SePay VietQR, GHN, GHTK,
  Shopee, TikTok Shop, Lazada — closing out all 3 documented marketplace
  connectors. The remaining providers Section 8 lists (ViettelPost, MISA
  meInvoice, Viettel S-Invoice, VNPT Invoice, Booking.com, Agoda,
  national-free-platform) are scaffolded stubs, not fabricated
  integrations — see `stub-connectors.ts`.
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
  calling the Anthropic SDK directly — no LiteLLM gateway/Langfuse yet, an
  explicit scope decision, see CLAUDE.md. Layer B (RAG) is real too now:
  `search_knowledge_base` embeds via Voyage AI (Anthropic's recommended
  embeddings partner) and does pgvector cosine-similarity search over
  `knowledge.chunks` — seeded ONLY with clearly-labeled sample/placeholder
  FAQ content (`scripts/ingest-knowledge.ts`), not a real corpus of
  Vietnamese tax/registration law, see that script's header comment.
  Also calls the 4th deployable's `/v1/forecast` endpoint via a new
  `get_sales_forecast` tool, from inside this Activity (never
  synchronously outside a Workflow/Activity).
- `services/ml-analytics` — the 4th deployable, and the first NOT in
  Node/TypeScript: Python/FastAPI + asyncpg. Own Postgres role
  `solodesk_ml`, SELECT-only on `sales.orders`, same least-privilege/RLS
  pattern as the other 3 (`db/migrations/0001_provision_ml_role.sql`,
  applied via `db/migrate.py` — same hand-written-migration, shared
  `public.schema_migrations` tracking table as all 3 other services). One
  real endpoint (`GET /v1/forecast/:tenant_id`): a linear-trend baseline
  forecast over the tenant's own confirmed order history — deliberately
  NOT the Prophet/statsmodels stack docs Section 8 names as this
  service's eventual target (heavier tooling, a later upgrade once this
  first cut has proven the service/role/calling-convention), and Whisper
  STT fine-tuning is out of scope entirely for now. Called only via a
  pre-shared `INTERNAL_SERVICE_TOKEN` (2nd consumer of backend-api's
  `InternalServiceGuard` mechanism), never a per-user JWT. No CI workflow
  yet — needs a Dockerfile and a Python build/publish `qnsc-ci` composite
  action this org doesn't have yet (docs Section 17.3 already flags this
  as a genuine, not-yet-filled gap); tests run locally via `pytest`.
- Postgres RLS + non-superuser app role in ALL FOUR services, done FIRST
  and correctly — read `services/backend-api/db/migrations/0002_provision_app_role.sql`,
  `services/connector-hub/db/migrations/0001_provision_connector_role.sql`,
  `services/agent-orchestrator/db/migrations/0001_provision_agent_role.sql`,
  and `services/ml-analytics/db/migrations/0001_provision_ml_role.sql`
  before adding any tenant-scoped table in any service.
- The cross-tenant leak tests (`services/backend-api/test/tenant-isolation.e2e-spec.ts`,
  `services/connector-hub/test/role-isolation.e2e-spec.ts`,
  `services/agent-orchestrator/test/role-isolation.e2e-spec.ts`,
  `services/ml-analytics/tests/test_role_isolation.py`) must never be
  weakened to make them pass.

- connector-hub's SePay webhook forwards a verified payment straight into
  backend-api's `payment-reconcile` (`POST /internal/payments/by-invoice-number`,
  authenticated by a shared `INTERNAL_SERVICE_TOKEN` secret — an explicit,
  narrow MVP mechanism, not SNS/SQS or a general service-mesh scheme yet).
  Verified end-to-end against two live dev servers — see CLAUDE.md.

- `apps/web-buyer-portal` — the first of docs' 3 named Next.js apps
  (`web-accounting`/`web-b2g-dashboard`/`web-buyer-portal`), scoped to
  just its QR-traceability half (not "order confirmation," which needs
  business/flow decisions this session shouldn't guess at). Next.js 16
  App Router, one real route: `/trace/[lotId]`, calling backend-api's
  already-real, public, unauthenticated `GET /v1/trace/:lotId`. Design
  system at `design-system/solodesk/MASTER.md` (Agriculture/Farm Tech
  palette — earth green + harvest gold, not generic SaaS blue — chosen
  and verified via the `ui-ux-pro-max` skill, with 2 of its automatic
  results manually overridden and the override reasoning documented
  in-file: the typography match and the marketing-landing page pattern
  neither fit a single-purpose lookup page). Reusable `Badge`/
  `EmptyState`/`SiteHeader`/`SiteFooter` components, meant to be reused by
  the other 2 apps once built.

Not yet built: `apps/mobile`, `apps/web-accounting`, `apps/web-b2g-dashboard`.

## Local dev

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres (pgvector-enabled) + valkey, shared by all four services
brew install temporal                            # agent-orchestrator only
cp services/backend-api/.env.example services/backend-api/.env
cp services/connector-hub/.env.example services/connector-hub/.env
cp services/agent-orchestrator/.env.example services/agent-orchestrator/.env
cp services/ml-analytics/.env.example services/ml-analytics/.env
# fill in DATABASE_ADMIN_URL / role passwords / VAULT_MASTER_KEY / ANTHROPIC_API_KEY / VOYAGE_API_KEY / INTERNAL_SERVICE_TOKEN per each .env.example's comments
pnpm install
pnpm --filter @solodesk/backend-api db:migrate
pnpm --filter @solodesk/connector-hub db:migrate
pnpm --filter @solodesk/agent-orchestrator db:migrate   # AFTER backend-api's — see its 0001 migration
pnpm --filter @solodesk/agent-orchestrator ingest:knowledge  # seeds sample Layer B knowledge chunks — needs a real VOYAGE_API_KEY
cd services/ml-analytics && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python3 db/migrate.py   # AFTER backend-api's — GRANTs on sales.orders
uvicorn app.main:app --host 0.0.0.0 --port 3003   # separate terminal
cd ../..
pnpm --filter @solodesk/backend-api dev          # :3000
pnpm --filter @solodesk/connector-hub dev        # :3001
temporal server start-dev                        # separate terminal — :7233 gRPC, :8233 Web UI
pnpm --filter @solodesk/agent-orchestrator worker  # separate terminal — the Activity executor
pnpm --filter @solodesk/agent-orchestrator dev     # :3002 — the HTTP client
cp apps/web-buyer-portal/.env.example apps/web-buyer-portal/.env.local
pnpm --filter web-buyer-portal dev                 # :3000 default — pass --port to avoid clashing with backend-api
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
