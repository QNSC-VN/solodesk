# SoloDesk — working notes

Read before touching DB, auth, or tenant-scoping code. Full architecture:
`docs/ARCHITECTURE.md` (English) / `docs/KIEN-TRUC-GIAI-PHAP.md` (Vietnamese).

## The one rule that matters most

**`tenants` (schema `identity`) is NOT RLS-scoped — it IS the tenant list.**
Every other table with a `tenant_id` FK follows the pattern in
`services/backend-api/db/migrations/0003_tenant_members_rls_template.sql`
verbatim: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, a policy on
`current_setting('app.tenant_id', true)::uuid` (the `true` = missing_ok, so a
forgotten tenant context fails CLOSED — zero rows — not open).

**Why this is non-negotiable, not style**: `rally` (sibling repo, same org)
implemented RLS, then removed it entirely after the role the app connected as
turned out to have `BYPASSRLS`/superuser, making every policy a silent no-op
for months. `cxgenie-be` (a different past product, same architect) never had
RLS at all — pure app-layer `workspace_id` filtering via guards, no DB
backstop. Both failure modes are real, observed, in this org's own history —
see docs Section 17.2 / 18.2. That's why this repo runs BOTH RLS-with-a-
correctly-provisioned-role AND an independent app-layer assert
(`assertTenantMatchesSession` in `src/platform/tenant-context.ts`, Section
4.4) — neither alone has held up in practice, here.

`services/backend-api/scripts/verify-app-role.sql` runs after every migration
(`src/db/migrate.ts`) and fails the deploy if `solodesk_app` is ever
superuser/BYPASSRLS. Never bypass this gate to "fix" a migration in a hurry —
that's exactly how rally's RLS went silently unenforced.

## `SET LOCAL`, not `SET`

`withTenantTransaction()` in `src/platform/tenant-context.ts` is the ONLY way
tenant-scoped code touches the DB. It uses `SET LOCAL app.tenant_id` inside a
transaction — never session-level `SET`. With transaction-mode connection
pooling, a connection is reused across different tenants between requests; a
session-level value would leak into the next tenant's request on the same
connection. `test/tenant-isolation.e2e-spec.ts`'s second test fires 20
concurrent transactions across both a seeded tenant A and B specifically to
catch this class of leak — it is not a stress test, it is the actual
regression case.

## The cross-tenant test must never be weakened to pass

`services/backend-api/test/tenant-isolation.e2e-spec.ts` — if a change to this
file only survives by adding an app-layer `.where()` filter to make the "no
filter at all" test pass, that's a regression in the RLS policy or the
`solodesk_app` grant, not a fix to the test. Read the file's own header
comment before touching it.

## Migrations are hand-written, matching `src/db/schema/*.ts`

Same convention as `rally`: `drizzle-kit generate` needs a TTY and won't run
unattended for column-rename detection, so `db/migrations/*.sql` are authored
by hand. `src/db/migrate.ts` applies them in filename order inside a
transaction each, tracked in `public.schema_migrations`.

**Every new schema needs its own `GRANT ... TO solodesk_app`** (see the
comment block in `0002_provision_app_role.sql`) — this repo deliberately does
not give the app role blanket rights, so a forgotten grant errors loudly
(`42501`) instead of failing silently the way an unfixed role would.

## Local dev

```bash
docker compose -f docker-compose.dev.yml up -d
cp services/backend-api/.env.example services/backend-api/.env  # then fill in secrets
pnpm install
pnpm db:migrate
pnpm --filter @solodesk/backend-api dev
```

`docker-compose.dev.yml`'s Postgres superuser is named `solodesk_superuser` on
purpose — it must never be the connection string the running app uses, not
even locally. `src/db/client.ts` only ever reads `DATABASE_URL`
(`solodesk_app`); `DATABASE_ADMIN_URL` is migration-only and does not belong
in the app's runtime env.

## Module skeleton — copy `identity-tenant`, not `work-items` from rally directly

`identity-tenant` is already this project's own reference shape:
`domain/{types,ports}` → `application/*.service.ts` →
`infrastructure/persistence/*.drizzle-repository.ts` → `api/*.controller.ts` +
`*.dto.ts`, wired in `*.module.ts` with `Symbol()` DI tokens exactly like
rally's `WORK_ITEM_REPOSITORY` pattern. Every new domain module
(`catalog-inventory`, `sales-order`, ...) copies this file layout, not
rally's file layout directly (rally's own domain types don't transfer —
Section 17.2).

## Real bugs hit on the first end-to-end run (Sprint 0) — don't reintroduce these

- **`postgres:18`'s official image changed its volume layout.** Data now lives
  under `/var/lib/postgresql` (pg_ctlcluster-style, version-suffixed
  subdirectory), not `/var/lib/postgresql/data` like every earlier major.
  Mounting the old path makes the container exit(1) on boot with a message
  about "unused mount/volume" — `docker-compose.dev.yml`'s `postgres` volume
  is already fixed to the new path; do not "fix" it back.
- **`@qnsc-vn/*` packages are NOT `workspace:*`** in this repo — they live in
  the separate `qnsc-app-platform` repo and are consumed as real published
  versions off GitHub Packages (`.npmrc`'s `@qnsc-vn:registry`), authenticated
  via `NODE_AUTH_TOKEN` (`gh auth token` works locally — the logged-in `gh`
  account needs `read:packages` scope). `workspace:*` only applies to
  `@solodesk/*` packages that actually live inside this pnpm workspace.
- **Peer versions across `@qnsc-vn/*` move independently of what you'd guess**:
  `platform-http@3.1.1` requires `zod@>=4` (not 3.x) and `@nestjs/swagger@>=11`
  (not 8.x, despite this being a NestJS 11 project — swagger's own major
  version doesn't track Nest's). Check `pnpm install`'s "Issues with peer
  dependencies" warning before assuming a version pin is fine.
- **`withTenantTransaction`'s `db` parameter must be generic over the schema
  type** (`PostgresJsDatabase<TSchema>`), not the bare un-parameterized
  `PostgresJsDatabase`, which TypeScript defaults to `PostgresJsDatabase<Record<string, never>>`
  under `exactOptionalPropertyTypes: true` — every caller passing the real
  `db` (typed with the actual schema) then fails to typecheck.
- **`db/migrate.ts`'s original password-escaping was wrong**: it built the SQL
  literal for `0002_provision_app_role.sql`'s `:'app_role_password'`
  placeholder via `postgres.js`'s tagged-template (`` sql`'${x}'` ``) stringified
  directly — that API builds parameterized-query fragments, not literal SQL
  text, and produced garbage that failed with a `42601` syntax error on the
  very first real migration run. Fixed to plain SQL-literal escaping
  (double embedded single quotes). If this file needs touching again, do not
  route a literal substitution through `postgres.js`'s query-builder API.
- **`.env` is loaded too late for module-level `process.env` reads.** `main.ts`
  now imports `dotenv/config` as its very first line, before `reflect-metadata`
  and everything else. `AppModule`'s import graph pulls in `db/client.ts`,
  which reads `process.env.DATABASE_URL` at module-load time — Node resolves
  `import`s eagerly, so this runs before Nest even starts, and
  `@nestjs/config`'s `ConfigModule.forRoot()` only helps code that reads
  `process.env` inside a provider's constructor/lifecycle, not top-level
  module code. Server crashed on first real `pnpm dev` run with exactly this
  error before the fix.
- **`@nestjs/platform-fastify@11` needs `@fastify/static@^10.1.2`, not `^8.x`**,
  for `SwaggerModule.setup()`'s static-asset serving. Missing/wrong version
  crashes the server with `PackageLoader` errors the moment
  `SWAGGER_ENABLED=true`, not at build time — only surfaces on a real run.
- **The tenant-onboarding route (`POST /v1/tenants`) legitimately runs before
  any tenant context exists**, but `TenantContextInterceptor` was originally
  global with no exemption — every onboarding request 401'd. Fixed with
  `@SkipTenantContext()` (`src/platform/skip-tenant-context.decorator.ts`), a
  `Reflector`-checked metadata flag. This is the ONLY sanctioned way to bypass
  the interceptor — never apply it to a route touching tenant-scoped data.
  Found by curling the real endpoint, not by reading the controller.
- **The auth guard is now wired for real** (`src/platform/auth/`) — verified
  end-to-end: real ES256-signed Bearer token → `GlobalJwtAuthGuard` →
  `request.user.contextId` → `TenantContextInterceptor` → RLS-scoped query,
  and a real cross-tenant token correctly gets `403 TENANT_MISMATCH`, not a
  leak. Read the header comment in `src/platform/auth/auth.module.ts` before
  changing any of this — it explains exactly what's wired (token
  verification) and what deliberately is NOT (login/SSO/refresh-rotation).

## Real bugs hit wiring the auth guard for real (same discipline as Sprint 0)

- **`@qnsc-vn/identity`'s exported `JwtAuthGuard`/`JwtStrategy` are real and
  solid — reused unchanged, not reimplemented.** The package's own README
  says neither `rally` nor `opshub` uses them (each wrote a heavier guard for
  BFF-cookie branching this repo doesn't need yet); don't take that as "these
  are broken," it's about product-specific extras, not a defect. SoloDesk's
  own divergence is intentionally minimal: `GlobalJwtAuthGuard`
  (`src/platform/auth/global-jwt-auth.guard.ts`) adds only a `@Public()`
  opt-out gate by composition, delegating all real verification/denylist
  logic to the package's guard instance unchanged.
- **`@qnsc-vn/platform-http`'s `RequestContextService` satisfies BOTH
  `AUTH_CONTEXT` (identity) and `REQUEST_CONTEXT` (platform-http's
  `GlobalExceptionFilter`) — bind ONE instance to both tokens via
  `useExisting`, don't write a separate placeholder for each.** It must be
  entered via `RequestContextService.run()` in **middleware**
  (`src/platform/request-context.middleware.ts`), not an interceptor — Nest's
  pipeline runs Middleware before Guards before Interceptors, and
  `setAuthContext()` (called by the guard) has nothing to mutate into unless
  the store was already entered before the guard ran.
- **`GlobalExceptionFilter` was never registered** — a plain thrown `Error`
  (e.g. `assertTenantMatchesSession`'s original `throw new Error(...)`) fell
  through to Nest's default handler as an opaque `500 Internal server error`
  instead of the real `403` it should have been. Found by actually curling a
  real cross-tenant token, not by reading the code — the assert itself fired
  correctly, only the HTTP status was wrong. Fixed two ways together: register
  `GlobalExceptionFilter` as `APP_FILTER` (in `auth.module.ts`, alongside the
  `REQUEST_CONTEXT` binding it needs), **and** stop throwing plain `Error` —
  `assertTenantMatchesSession` now throws `PermissionDeniedException` from
  `@qnsc-vn/platform-http` (Mục 20.2: every error flows through that
  taxonomy, no exceptions).
- **`fastify` must be a direct dependency for its types**, even though
  `@nestjs/platform-fastify` pulls it in transitively — pnpm's strict
  node_modules layout means `import type { FastifyRequest } from 'fastify'`
  (in the request-context middleware) doesn't resolve otherwise.
- **`contextId`, not `tenantId`, is the field on `request.user`** after the
  guard runs — it's `@qnsc-vn/identity`'s deliberately generic name for
  "authorization scope" (its own doc comment: "for a multi-tenant product
  \[rally\] this is the active workspace id"). `TenantContextInterceptor`
  bridges that vocabulary once, in one place — don't add a second `tenantId`
  field anywhere upstream of it.

## `catalog-inventory` — the reference pattern for race-safe stock mutation

Second real module, same hexagonal skeleton as `identity-tenant`. Its
contribution is `LotDrizzleRepository`'s `atomicUpdate` — copy this pattern
for any future module mutating a quantity/balance/counter under concurrency
(booking capacity, cash-drawer balance, ...):

- Every mutation is one `UPDATE ... WHERE id = ? AND tenant_id = ? AND
  <guard> RETURNING *`, guard and patch computed in SQL (`quantity_on_hand -
  quantity_reserved >= qty`), never read-then-write from application code.
  Postgres's row lock on the matched row serializes concurrent callers; the
  loser's guard re-evaluates against the winner's already-committed change.
  No version column, no optimistic-lock retry loop needed — verified by
  `test/inventory-race.e2e-spec.ts` firing 20 real concurrent
  `consumeDirect` calls against 10 available units: exactly 10 succeed,
  10 see insufficient stock, the balance never goes negative.
- A failed guard returns `null` from the repository, not an exception — the
  application-layer service (`InventoryService`) decides that's a
  `ConflictException`, keeping the repository's contract to "this DB
  operation either happened or didn't," not "this business rule was violated."
- Postgres `numeric` is exact decimal — no epsilon comparison needed in a
  guard, unlike a floating-point balance. Don't add one "to be safe"; it's
  dead code that suggests a problem that doesn't exist here.
- `InventoryService.sellFromSku`'s scope limit is stated in its own comment,
  not hidden: it only consumes from the single oldest available lot. A sale
  needing to split across multiple lots atomically is out of scope until a
  real need for it shows up (YAGNI) — the caller can drive `consumeDirect`
  per lot itself meanwhile.

## Conventions

Conventional commits. New env var → `src/config/env.schema.ts` **and**
`.env.example` **and** `.github/workflows/backend-api-ci.yml` **and** (once it
exists) `infra/live/*` — same rule as rally, same reason: a var real in three
places and forgotten in the fourth fails silently in exactly the one place
nobody checked.
