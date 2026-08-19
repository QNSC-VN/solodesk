# SoloDesk

Multi-tenant SaaS platform for the Gia Lai Kế nghiệp số program — see
`docs/ARCHITECTURE.md` (English) / `docs/KIEN-TRUC-GIAI-PHAP.md` (Vietnamese) for
the full solution architecture. This repo is the monorepo (Section 8): one
GitHub repo, multiple independently-deployable services.

## Sprint 0 — what exists right now

- `services/backend-api` — NestJS + Fastify + Drizzle. One real module,
  `identity-tenant`, built as the reference hexagonal skeleton (copied from
  `rally`'s pattern, see `docs/ARCHITECTURE.md` Section 17.2) every future
  module copies.
- Postgres RLS + non-superuser app role, done FIRST and correctly — read
  `services/backend-api/db/migrations/0002_provision_app_role.sql` before
  adding any tenant-scoped table.
- The cross-tenant leak test (`services/backend-api/test/tenant-isolation.e2e-spec.ts`)
  is the one test in this repo that must never be weakened to make it pass.

Not yet built: `apps/mobile`, `apps/web-*`, `services/connector-hub`,
`services/agent-orchestrator`, `services/ml-analytics`. Sprint 1 per the
architecture docs' phased rollout (Section 10), gated on the two open business
decisions in Section 13 (LLM data residency, partner/app-store timelines).

## Local dev

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + valkey
cp services/backend-api/.env.example services/backend-api/.env
# fill in DATABASE_ADMIN_URL / SOLODESK_APP_ROLE_PASSWORD from docker-compose.dev.yml
pnpm install
pnpm db:migrate
pnpm --filter @solodesk/backend-api dev
```

Run the cross-tenant isolation gate locally before touching anything in
`src/platform/tenant-context.ts` or any repository:

```bash
DATABASE_URL=postgres://solodesk_app:<pw>@localhost:5432/solodesk \
  pnpm --filter @solodesk/backend-api test:e2e
```

## Conventions

Conventional commits. New env var → `src/config/env.schema.ts` **and**
`.env.example` **and** the CI workflow **and** (once it exists) `infra/live/*`
— same rule rally uses, for the same reason (a var that's real in three places
and forgotten in the fourth fails silently in exactly one of them).
