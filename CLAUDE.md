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

## `sales-order` — cross-aggregate transactions and idempotency, made real

Third module. Two platform primitives it introduced, both cross-cutting —
copy them, don't re-derive them for the next module that needs either:

- **`withTenantTransactionOrReuse` (`tenant-context.ts`) + an optional
  trailing `tx` on every mutating repository method** is how an
  application-service spans writes across two aggregates in ONE transaction.
  `OrderService.placeOrder` is the concrete case: it opens one
  `withTenantTransaction`, then calls `lotRepository.consumeDirect(..., tx)`
  and `orderRepository.create(..., tx)` with that SAME `tx` — so a failed
  stock-consume rolls back the order insert too, and vice versa. Before this,
  `ILotRepository`'s methods only ever opened their own transaction, which
  would have made this exact atomicity impossible without a bigger rewrite.
  `OrderService` injects `LOT_REPOSITORY`/`SKU_REPOSITORY` directly (not
  through `InventoryService`/`CatalogService`) — repository-to-repository
  composition at the application layer is the accepted shape for a
  cross-aggregate transaction script; going through another module's
  application service would mean that service also needing a `tx`-aware
  public API it doesn't otherwise need.
- **`withIdempotency` (`platform/idempotency.ts`)** is Mục 5.2 made real: an
  `INSERT ... ON CONFLICT DO NOTHING` on `platform.idempotency_keys` inside
  the SAME transaction as the effect it guards. Two truly concurrent
  requests with the same key: Postgres's unique-index row lock blocks the
  second insert until the first's transaction resolves, so the second either
  sees the first's committed cached response or (if the first rolled back)
  proceeds normally — no explicit retry loop needed. Verified end-to-end by
  `test/order-idempotency.e2e-spec.ts`: 3 concurrent `placeOrder` calls with
  one key consume stock once and return the same order; a failed attempt
  (insufficient stock) rolls back far enough that the SAME key can retry and
  succeed later — the key is never "burned" by a failed attempt.
- Order lines snapshot `unitPrice` at order time (`sku.unitPrice`, copied
  into the row) rather than joining `catalog.skus` live — the concrete fix
  for Mục 11's "giữ giá đơn treo khi đổi giá sản phẩm."

## `invoicing-tax` — Strategy pattern for tax calc, cumulative e-invoice threshold

Fourth module. Depends on `IdentityTenantModule` (industry) and
`SalesOrderModule` (order lookup) via their exported services, not their
repositories — unlike `sales-order`→`catalog-inventory`, invoice issuance
doesn't need to share a transaction with order placement (the order is
already committed by the time an invoice is issued), so `InvoiceService`
just calls `OrderService.getOrder`/`TenantService.getTenant` normally.

- **`tax.tax_rules` is reference data, NOT tenant-scoped — no `tenant_id`
  column, no RLS.** Same rates apply to every tenant; versioned by
  `effective_from`/`effective_to` and seeded by migration (`0007_...sql`),
  never edited in place. `industry IS NULL` is the fallback rule;
  `TaxRuleDrizzleRepository.findActiveRule` sorts industry-specific matches
  before the NULL fallback. Rates seeded are illustrative pilot placeholders,
  NOT verified statutory rates — flagged in the migration's own comment,
  pending the real Tax Dept. confirmation (docs Section 13).
- **`TaxCalculationService` (the Strategy engine) deliberately does NOT
  decide `requiresEInvoice`.** It only resolves the active rule and computes
  `taxAmount`/`totalAmount` for one subtotal. The e-invoice threshold check
  is genuinely a different question — cumulative revenue across ALL of a
  tenant's invoices this calendar year, not a per-invoice amount — so it
  lives in `InvoiceService.issueInvoice` instead, backed by
  `InvoiceDrizzleRepository.sumIssuedSubtotalSince`. The tempting-but-wrong
  shortcut is comparing a single order's subtotal directly against the
  1-tỷ-VND threshold — almost never true for one invoice, which would
  silently misreport nearly every tenant as never needing an e-invoice.
  `test/invoice-tax.e2e-spec.ts`'s last case guards against exactly that:
  two orders, neither over the threshold alone, the second one's invoice
  correctly flips `requiresEInvoice` true once their sum crosses it.
- **Invoice numbering (`tax.invoice_sequences`) reuses the
  `atomicUpdate`-style single-statement pattern**, not a Postgres `SERIAL`/
  sequence object: `INSERT ... ON CONFLICT (tenant_id) DO UPDATE SET
  next_number = next_number + 1 RETURNING ...`, in the SAME transaction as
  the invoice insert. If the insert fails, the whole transaction (sequence
  bump included) rolls back — no permanently-skipped invoice number, unlike
  a real Postgres sequence (which never rolls back its `nextval()`).
- One invoice per order (`UNIQUE (tenant_id, order_id)`), checked
  app-side first for a friendly `ConflictException`, same convention as
  `CatalogService.createSku`'s SKU-code check — the DB constraint is the
  real backstop, the app check is the fast path.

## `payment-reconcile` — derived summary, not a stored status column

Fifth module. Depends on `InvoicingTaxModule`'s exported `InvoiceService`
only (invoice lookup + total), same module-boundary discipline as
`invoicing-tax` depending on `OrderService`/`TenantService` rather than
reaching into another schema directly.

- **`getPaymentSummary` sums `payments.payments` and compares to
  `invoice.totalAmount` on every call — no `isFullyPaid`/status column
  anywhere.** A stored status is one more place a bug can let the truth
  (the payments actually recorded) drift from what's displayed. Section
  20.5's CQRS-lite already made this call for the read/write split in
  general; this is the same call applied to one derived boolean.
- **`reference_code` is a partial unique index
  (`WHERE reference_code IS NOT NULL`), not a plain unique column** — cash
  payments legitimately have no reference and must not collide with each
  other via a shared `NULL`. This is docs Section 7's inbound-webhook dedup
  guidance ("unique index on `provider_event_id`") adapted to payments: a
  retried bank/QR webhook relay from `connector-hub` (once it exists) hits
  this and gets rejected with `DUPLICATE_PAYMENT_REFERENCE` instead of
  double-recording revenue.
- **Overpayment is rejected, not clamped or silently accepted** — recording
  a payment that would push `paidAmount` over `invoice.totalAmount` throws
  `ConflictException('OVERPAYMENT', ...)`. Chosen because household-business
  cash sales are exact-amount transactions in this program's flow; if a real
  need for partial refunds/change-tracking shows up, that's a new explicit
  feature, not a silent clamp here.
- Actual SePay/bank webhook receipt, credential vaulting, and retry/backoff
  live in `connector-hub` (Section 5.4) — doesn't exist yet. This module is
  what `connector-hub` will call into once it does; for now, `POST
  /v1/payments` also serves the real MVP need of staff manually recording a
  cash payment at the counter.

## `booking-resource` — the aggregate-race case `atomicUpdate` can't cover

Sixth module, two aggregates (`Resource`, `Booking`) like `catalog-inventory`'s
`Sku`/`Lot`. Its contribution: capacity-vs-overlapping-bookings is the first
race condition in this codebase that a single guarded `UPDATE ... RETURNING`
genuinely cannot fix.

- **Why not `atomicUpdate`:** that pattern locks ONE existing row and
  re-checks its guard. Booking capacity is a check across a SET of
  overlapping rows, and when a time slot is still completely empty there is
  no row yet to lock — two concurrent first-hold requests for an empty slot
  would both read "0 used, capacity available" and both insert, oversold.
- **The fix: `pg_advisory_xact_lock(hashtext(resourceId)::bigint)`**, taken
  at the top of `BookingDrizzleRepository.requestHold`'s transaction, before
  the overlap sum runs. Transaction-scoped (`_xact_`), so it releases
  automatically on commit OR rollback — no manual unlock, no risk of a
  held lock outliving a crashed request. Keyed by `resourceId` alone (not
  also `tenantId`) is fine — `resourceId` is already globally unique, and
  different resources never contend for the same lock. Verified by
  `test/booking-race.e2e-spec.ts`: 20 concurrent holds against a
  capacity-10 resource, exactly 10 succeed; 2 concurrent holds on a
  capacity-1 resource for the identical window, exactly 1 succeeds.
- **An expired, never-confirmed hold is never swept by a background job.**
  It just stops satisfying `activeForCapacity`'s `hold_expires_at > now()`
  check once expired, so it stops counting toward capacity on its own —
  correctness doesn't depend on a cron/cleanup worker existing. A sweep job
  for tidiness/reporting (e.g. bulk-marking stale holds `cancelled`) is a
  real but separate concern, out of scope until something other than
  correctness needs it (YAGNI).
- `confirm`/`cancel`/`markNoShow` ARE single-row guarded updates (`atomicUpdate`'s
  pattern applies fine there — no aggregate check needed) — only the
  capacity check on `requestHold` needed the advisory lock.

## `procurement` — mirrors `sales-order`, in the other direction

Seventh module. Three aggregates: `Supplier`, `NegotiatedPrice`, `PurchaseNote`
(+lines). `PurchaseNoteService.recordPurchase` is deliberately the same shape
as `OrderService.placeOrder` — one `withTenantTransaction`, `withIdempotency`
inside it, `LOT_REPOSITORY`/`SKU_REPOSITORY` injected directly for
shared-transaction composition — because procurement genuinely IS
sales-order's mirror image: buying stock in instead of selling it out.

- **`ILotRepository.receive()` gained an optional trailing `tx` param** (it
  never needed one before this module) — the same "every mutating
  repository method takes an optional `tx` last, composes via
  `withTenantTransactionOrReuse`" convention `sales-order` established, just
  reaching a method that hadn't needed it yet. Existing call sites
  (`InventoryService.receiveLot`, every e2e test's seed helper) are
  unaffected — an added optional parameter, not a signature break.
- **`negotiated_prices` is per-TENANT versioned config, not per-tenant
  global reference data like `tax.tax_rules`.** A supplier's negotiated
  cost is that tenant's own business relationship, so it lives with RLS,
  unlike the tax-rate table. Same half-open-interval versioning discipline
  though (`effective_from`/`effective_to`, `effective_to = NULL` = current):
  `NegotiatedPriceDrizzleRepository.setActive` closes the old active row
  and inserts the new one in ONE transaction — a partial unique index
  (`WHERE effective_to IS NULL`) backstops "only one active price per
  supplier+SKU" at the DB level.
  `test/procurement.e2e-spec.ts` proves the point that actually matters:
  repricing a supplier does NOT retroactively change what an
  already-recorded purchase note snapshotted as its `unit_cost` — same
  "snapshot at transaction time" discipline as `sales.order_lines.unit_price`
  and `tax.invoices.tax_rate`.
- No explicit `unitCost` AND no active negotiated price is a hard
  `ConflictException('NO_NEGOTIATED_PRICE', ...)`, never a silent zero or a
  fallback to `sku.unit_price` — that field is the SELLING price; reusing
  it as a purchase cost would be a real (and wrong) number, not a missing
  one, which is worse than refusing outright.

## `traceability` — the one table in this codebase with NO RLS, on purpose

Eighth (and, per the docs' module list, last of the originally-scoped
domain modules) — `GET /v1/trace/:lotId` is the first genuinely PUBLIC,
unauthenticated route with real business data behind it (a buyer scanning
a QR code printed on a product). Every other route in this codebase
assumes an authenticated tenant session; this one must work with NONE.

- **`traceability.lot_traces` has no `tenant_id` RLS policy at all — not
  an oversight, the entire point.** RLS policies gate on
  `current_setting('app.tenant_id', true)`; a request with no tenant
  context sets that to NULL, and `tenant_id = NULL` is never true, so a
  naive "just query without setting tenant" approach on an RLS-protected
  table returns nothing, not a leak — but it also means the feature
  literally cannot work that way. The fix is a dedicated, deliberately
  denormalized public-projection table with NO RLS, populated only by an
  explicit, authenticated publish action — never touched by the public
  read path, so there's no RLS bypass to reason about because there's no
  RLS on this table to bypass in the first place.
- **A row exists here ONLY if `POST /v1/trace/:lotId/publish` was called.**
  Receiving a lot into stock (`catalog-inventory`, `procurement`) never
  auto-publishes one — that would mean an OLDER module (`catalog-inventory`)
  reaching FORWARD into a module built after it, breaking the layering
  every other module composition in this codebase respects (`sales-order`/
  `procurement`/`traceability` all depend on strictly earlier modules,
  never the reverse).
- **`lotRepository.findById(lotId, tenantId)` returning non-null IS the
  ownership check** before `publishLotTrace` writes anything — RLS
  guarantees a cross-tenant lot ID returns null here, so a tenant
  literally cannot publish (or re-publish) a lot it doesn't own.
  `test/traceability.e2e-spec.ts` proves this concretely: an "attacker"
  tenant's publish attempt on another tenant's lot throws, and the lot's
  public trace stays not-found afterward.
- **`@Public()` + `@SkipTenantContext()` together, only on the `GET`
  handler** — `POST /v1/trace/:lotId/publish` stays fully authenticated
  and tenant-scoped as normal. Confirmed the public route never calls
  `getCurrentTenantId()`/`assertTenantMatchesSession()` (would throw with
  no ALS context entered — `TenantContextInterceptor` never runs for a
  `@SkipTenantContext()` route, by design).
- The public response DTO deliberately omits `tenantId` — no reason to
  expose an internal tenant identifier to an anonymous buyer, even though
  it isn't itself a secret.

## Conventions

Conventional commits. New env var → `src/config/env.schema.ts` **and**
`.env.example` **and** `.github/workflows/backend-api-ci.yml` **and** (once it
exists) `infra/live/*` — same rule as rally, same reason: a var real in three
places and forgotten in the fourth fails silently in exactly the one place
nobody checked.

---

# `services/connector-hub` — separate deployable, everything above is `backend-api`

Second real service in this repo. Everything in this section is
`services/connector-hub/*`, not `backend-api` — same repo conventions
(Fastify, Drizzle, hand-written migrations, RLS + `SET LOCAL app.tenant_id`,
`@qnsc-vn/identity` JWT auth reused unchanged) copy-pasted rather than
shared via an internal package (Section 20.6 YAGNI — two call sites don't
earn a `@solodesk/platform-toolkit` yet). Local dev: `PORT=3001`,
`pnpm --filter @solodesk/connector-hub dev`, its own
`pnpm --filter @solodesk/connector-hub mint-dev-token <tenantId>` (same
mechanism as backend-api's, same JWT keypair — copy the exact
`JWT_PUBLIC_KEY`/`DEV_JWT_PRIVATE_KEY` values from `backend-api/.env` into
`connector-hub/.env`, one identity provider across services).

## Same Postgres database, separate role, separate schemas — the security boundary made real

Docs Section 3's stated reason connector-hub must be a separate deployable:
"security boundary — only this component touches the credential vault and
calls out to the internet." This is enforced at the DB level, not just by
running as a different process:

- **`solodesk_connector` is a DIFFERENT role from backend-api's
  `solodesk_app`** (`db/migrations/0001_provision_connector_role.sql`,
  same NOSUPERUSER/NOBYPASSRLS provisioning pattern as backend-api's
  `0002_provision_app_role.sql`), GRANTed only on its OWN schemas
  (`vault`, `sync`) — never `identity`/`catalog`/`sales`/`tax`/`payments`/
  `booking`/`procurement`/`traceability`. `test/role-isolation.e2e-spec.ts`
  proves this for real: `solodesk_connector` cannot `SELECT` from
  `identity.tenants` even when it exists in the same database.
- **No cross-schema foreign keys into backend-api's tables.** `tenant_id`
  columns in `vault.*`/`sync.*` are plain `uuid`, not FKs — two
  independently-deployable services referencing each other's IDs without a
  DB-level FK is the normal, correct shape once you've committed to
  separate deployables; a cross-schema FK would silently recreate the
  coupling the split is supposed to remove.
- **Same `public.schema_migrations` ledger table, both services' migrators
  write to it** — safe because each service's migration filenames are
  distinct exact strings (backend-api's `0001_init_identity_schema.sql` vs
  connector-hub's `0001_provision_connector_role.sql`); the primary key is
  the literal filename, not a shared sequence-number space. Keep it that
  way — never let both services' migrations dirs contain the identically-
  named file.

## Vault — encryption, and the two tables with NO RLS on purpose

- **`vault.credentials`**: AES-256-GCM (`platform/crypto/encryption.service.ts`),
  fresh random IV per encryption call, ciphertext/iv/authTag stored as
  separate `bytea` columns. `VaultService.setCredentials` is the ONLY path
  plaintext ever reaches disk-bound code, and it always encrypts before
  the repository sees anything. `getDecryptedPayload` is the only path
  back to plaintext, and it's for connector adapters to call internally —
  no HTTP endpoint ever returns a decrypted payload, only metadata
  (provider/isActive/updatedAt), matching how a real secrets vault behaves
  (write-only from outside). Setting new credentials for a tenant+provider
  UPSERTS (`ON CONFLICT (tenant_id, provider) DO UPDATE`) rather than
  versioning like `procurement.negotiated_prices` — a rotated/revoked API
  key has no legitimate reason to be replayed against a past record, unlike
  a price a past invoice snapshotted.
- **`vault.webhook_tokens` has NO RLS — deliberately, same "narrow,
  public-lookup-safe projection" shape as backend-api's
  `traceability.lot_traces`.** An inbound webhook (SePay etc.) arrives with
  no SoloDesk JWT at all; this table's only job is resolving an unguessable
  `token` (the URL segment a tenant configures in a provider's dashboard)
  to a `(tenant_id, provider)` pair so the handler can `runWithTenant()`
  and query `vault.credentials` normally afterward. It holds NO secret
  material — knowing a token only reveals which tenant+provider it maps
  to, never a credential. `VaultService.getOrCreateWebhookToken` is
  idempotent (same token every call for a given tenant+provider, never a
  second row).
- **`sync.webhook_events` dedups on `UNIQUE (provider, provider_event_id)`**
  (docs Section 7) — `WebhookIntakeService.recordEvent` is generic across
  every provider, `INSERT ... ON CONFLICT DO NOTHING` same idempotency
  shape as backend-api's `platform/idempotency.ts`. Verified under real
  concurrency in `test/webhook-dedup.e2e-spec.ts`: 3 truly concurrent
  deliveries of the identical event resolve to exactly one stored row.

## Resilience layer (`platform/resilience/*`) — bulkhead per provider

- **`connector-http.ts`**: every outbound call goes through `connectorFetch`
  — a ~10s client-level timeout (docs Section 5.4: "a hung call must not
  sit inside the outer budget unnoticed") and classifies the failure as
  `RetryableConnectorError` (network/timeout, 5xx, 429) or
  `NonRetryableConnectorError` (other 4xx) — never a bare `Error`.
- **`connector-policy.ts`**: one cockatiel retry+circuit-breaker policy
  instance PER PROVIDER, cached in a module-level `Map` so a breaker's
  open/closed state actually persists across calls. This is the bulkhead
  docs Section 5.4 asks for — a degraded Shopee must never trip the
  breaker (or exhaust the retry budget) for GHN or SePay. Every adapter
  method wraps its real call in `callWithResilience(provider, fn)`.

## Three reference connectors, real API shapes, NOT live-verified

Scope decision (recorded here, not silently made): building real,
untestable-without-keys integration logic for all 11+ providers docs
Section 8 lists risked confidently-wrong code across many at once. Built
for real: **SePay** (VietQR — pull API in `sepay.adapter.ts` + inbound
webhook in `sepay-webhook.controller.ts`, the two-factor token+secret
resolution described above), **GHN** (shipping — order create/track,
`Token`/`ShopId` header auth), **Shopee** (marketplace — Open Platform v2
HMAC-SHA256 request signing). Every method's field/endpoint shape matches
each provider's public docs as accurately as training knowledge allows,
but NONE of the three has been exercised against a live account — that
needs the user's real keys, entered via `POST /v1/vault/:provider/credentials`,
then confirmed via `POST /v1/connectors/:provider/verify` (a real API call,
not a format check). The remaining providers (`stub-connectors.ts`:
TikTok Shop, Lazada, GHTK, ViettelPost, MISA meInvoice, Viettel S-Invoice,
VNPT Invoice, Booking.com, Agoda, national-free-platform) throw a clear
not-implemented error rather than fabricate signing/API logic — promote
one by moving it to its own `connectors/<provider>/` folder following
`sepay.adapter.ts`'s shape.

## SePay webhook → `payment-reconcile` forwarding — done, via a shared-secret MVP, not SNS/SQS

`SepayWebhookController` now forwards a verified, deduped, `transferType:
"in"` payment event to backend-api's `POST /internal/payments/by-invoice-number`
whenever it can extract an `INV-YYYY-NNNNNN` pattern from the transfer's
`content` (`sepay/extract-invoice-number.ts`) — the note a VietQR payer's
bank app carries through, matching `InvoiceDrizzleRepository`'s assigned
format exactly. Verified end-to-end against two live dev servers: onboard
→ SKU → lot → order → invoice → set SePay creds → real webhook POST →
`forwarded: true` → backend-api's payment summary shows `isFullyPaid`.

- **Authentication is a pre-shared secret (`INTERNAL_SERVICE_TOKEN`), NOT
  SNS/SQS (docs Section 6) and NOT a per-user JWT.** Both services validate
  the exact same value — connector-hub sends it as `X-Internal-Service-Token`,
  backend-api's `InternalServiceGuard` checks it with `timingSafeEqual`
  (constant-time, avoids a timing side-channel). This is a deliberate,
  narrow, honest MVP mechanism for exactly ONE route family
  (`internal/payments/*`) — not a general service-mesh/mTLS scheme. Revisit
  before this pattern gets a second consumer.
- **The receiving route is `@Public()` + `@SkipTenantContext()`** — there's
  no per-user session on a machine-to-machine call, so `tenantId` travels
  explicitly in the request body instead of a JWT's `contextId`, and the
  handler manually `runWithTenant(dto.tenantId, ...)`s before calling
  `PaymentService`. `@ApiExcludeController()` keeps it out of the Swagger
  doc — reachable at the same base URL, but not a public API surface.
  `PaymentService.recordPaymentByInvoiceNumber` resolves the invoice via
  `InvoiceService.getInvoiceByNumber` (new: invoice numbers are the
  human-readable form a bank-transfer note carries, never a UUID) then
  delegates straight to the existing `recordPayment` — every guard
  (cancelled/duplicate-reference/overpayment) applies identically
  regardless of which entry point reached it.
- **`sync.webhook_events.forwarded_at` (nullable) separates "seen" from
  "successfully synced downstream"** — the column this repo's own earlier
  YAGNI note said to add only once forwarding was actually being built.
  Deliberately NOT caught inside `SepayWebhookController`: letting a
  forward failure throw returns a non-2xx response, which is what makes
  SePay's OWN webhook redelivery double as the retry mechanism for the
  forward step (`forwarded_at` stays NULL until a forward attempt actually
  succeeds) — there is no internal retry queue yet, and this is an
  explicit, honest MVP choice, not an oversight.
- **One narrow edge case handled on purpose:** a `409
  DUPLICATE_PAYMENT_REFERENCE` from backend-api PROVES the payment already
  landed on some earlier attempt (connector-hub crashed after backend-api
  committed but before `markForwarded` ran) — `BackendApiPaymentClient
  .forwardPayment` treats that specific error as success rather than
  re-throwing it, because re-throwing it would retry forever (backend-api
  correctly rejects the exact same duplicate every time) with `forwarded_at`
  never getting set — a real livelock a payment system cannot afford.
- **Still explicitly NOT built:** GHN/Shopee have no equivalent forwarding
  path yet (nothing downstream needs one today); a genuine SNS/SQS event
  bus (docs Section 6) if/when a second consumer of these events shows up,
  since a growing number of pre-shared-secret point-to-point integrations
  is exactly the coupling an event bus exists to avoid.
