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

## Four reference connectors, real API shapes, NOT live-verified

Scope decision (recorded here, not silently made): building real,
untestable-without-keys integration logic for all 11+ providers docs
Section 8 lists risked confidently-wrong code across many at once. Built
for real: **SePay** (VietQR — pull API in `sepay.adapter.ts` + inbound
webhook in `sepay-webhook.controller.ts`, the two-factor token+secret
resolution described above), **GHN** (shipping — order create/track,
`Token`/`ShopId` header auth), **GHTK** (shipping — order create/track,
plain `Token` header auth, promoted from a stub — see the section below
on why it was promoted before an e-invoice provider), **Shopee**
(marketplace — Open Platform v2 HMAC-SHA256 request signing), **TikTok
Shop** (marketplace — Partner Center API v2, HMAC-SHA256 wrapped with the
app secret on both ends of the signed string, the same signing family as
Shopee's — see "Why TikTok Shop, not Booking.com" below). Every method's
field/endpoint shape matches each provider's public docs as accurately as
training knowledge allows, but NONE of the five has been exercised against
a live account — that needs the user's real keys, entered via `POST
/v1/vault/:provider/credentials`, then confirmed via `POST
/v1/connectors/:provider/verify` (a real API call, not a format check).
The remaining providers (`stub-connectors.ts`: Lazada, ViettelPost, MISA
meInvoice, Viettel S-Invoice, VNPT Invoice, Booking.com, Agoda,
national-free-platform) throw a clear not-implemented error rather than
fabricate signing/API logic — promote one by moving it to its own
`connectors/<provider>/` folder following `sepay.adapter.ts`'s shape.

## Why TikTok Shop, not Booking.com — a mid-flight course correction

Booking.com was the first pick for the 5th connector, reasoned as closing
a real gap (connector-hub has no OTA/hospitality connector at all, and
agent-orchestrator's `get_upcoming_bookings` tool already covers that
domain from the read side). That reasoning was wrong on a factual point
checked only after starting: Booking.com's real Connectivity API is
OAuth2 + partner-certification gated, not a simple key/token or HMAC
REST call like SePay/GHN/GHTK/Shopee — the same "confidently-wrong code
without a way to verify it" risk category the e-invoice providers were
already passed over for (see below). Course-corrected to TikTok Shop
before writing any adapter code: same HMAC-signing family as the
already-working `shopee.adapter.ts` (proven shape, not a new risk
category), and arguably the more relevant channel for Vietnamese
household sellers right now than Lazada. Domain diversity (OTA/booking)
is a real gap still — just not one to close by assuming an API shape
without checking it first.

## Why GHTK (shipping) was promoted next, not an e-invoice provider

`tax.invoices.requires_e_invoice` (backend-api) has been computed
correctly since the `invoicing-tax` module was built, but nothing acts on
it — no e-invoice ever actually gets submitted anywhere. That's the more
"valuable" gap to close, and MISA meInvoice/Viettel S-Invoice/VNPT
Invoice would close it. They were deliberately passed over anyway: those
three are the ones this repo's own earlier scope note already flagged as
the highest-risk category — typically SOAP/XML with digital-signature
requirements, not simple JSON REST like SePay/GHN/Shopee/GHTK. Building
one now would reintroduce exactly the "confidently-wrong code without a
way to verify it" risk the original 3-connector scope cut existed to
avoid. GHTK's `Token`-header REST shape is nearly identical to GHN's
already-working pattern — the safer next connector, not the most valuable
gap. The e-invoice gap is real and still open; closing it needs either a
provider with genuine REST docs or a live sandbox account to verify
against, neither of which changed by promoting GHTK.

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

---

# `services/agent-orchestrator` — third deployable: Temporal worker + one real MCP tool

Local dev needs the Temporal CLI (`brew install temporal`), then
`temporal server start-dev` in its own terminal (embedded sqlite, Web UI
at `:8233`) — self-hosted-vs-Cloud for a real deployment is an explicitly
unresolved docs Section 13 business decision, not decided here. Then, in
this service's directory: `pnpm worker` (the Activity executor — plain
`tsx` script, NOT a NestJS app) and `pnpm dev` (the HTTP client — a thin
NestJS app that starts/signals/queries workflows) as two SEPARATE
processes, matching Temporal's own architectural requirement. `pnpm
db:migrate` here MUST run AFTER backend-api's own migrations — see
`db/migrations/0001_provision_agent_role.sql`'s header comment.

## Scope decision, made explicit (recorded here, not silently narrowed)

Docs Section 5 describes a LiteLLM gateway, Langfuse prompt management,
and Layer B RAG (pgvector). NONE of that is built yet. This first cut is:
a real Temporal worker, a real MCP-shaped tool-calling Activity, ONE real
read-only Layer A tool (`get_sales_summary`), calling the Anthropic SDK
DIRECTLY (docs Section 5.5 explicitly allows this: "calling the Anthropic/
OpenAI/Google SDKs directly ... is sufficient"). No multi-provider
fallback, no per-tenant LLM budget, no Langfuse, no RAG. Promote pieces of
this incrementally as real need shows up — don't assume the full Section 5
stack exists because this directory does.

## Why this service's DB role is READ, unlike connector-hub's NONE

`solodesk_agent` (own migration, own NOSUPERUSER/NOBYPASSRLS provisioning,
same pattern as the other two services) is GRANTed SELECT — and ONLY
SELECT — on exactly the tables a Layer A tool needs, one migration per
tool that introduced a new one (`0001`: `identity.tenants`/`sales.orders`
for `get_sales_summary`; `0002`: `catalog.skus`/`catalog.lots` for
`get_stock_level`; `0003`: `tax.invoices`/`payments.payments` for
`get_outstanding_invoices`), nothing else, no INSERT/UPDATE/DELETE
anywhere ever. This is a genuinely different security boundary from
connector-hub's (which must NEVER read backend-api's business tables at
all): agent-orchestrator's whole job is ANSWERING QUESTIONS about that
data (docs Section 5.1's Layer A — "the household's own data ... executed
directly against Postgres with `app.tenant_id` set so RLS enforces
automatically"), so read access is the point, not a leak.
`test/role-isolation.e2e-spec.ts` proves both halves for real: CAN read
`sales.orders`/`catalog.skus`/`catalog.lots`/`tax.invoices`/`payments.payments`,
CANNOT write to any of them, CANNOT read a table it wasn't explicitly
GRANTed on (`booking.bookings`, connector-hub's `vault.credentials`).

**Cross-service migration ordering is a REAL, load-bearing dependency
here** (unlike connector-hub, which has zero schema coupling to
backend-api on purpose) — `0001_provision_agent_role.sql` GRANTs on tables
backend-api's own migrations create. Run backend-api's migrations first,
every environment, or this one 42P01s loudly.

## No AsyncLocalStorage tenant-context layer on this service — a deliberate simplification

Unlike backend-api/connector-hub, this service has neither
`tenant-context.interceptor.ts` nor `runWithTenant()`/`getCurrentTenantId()`.
Reasoning: Activities run in the WORKER process, invoked by Temporal
directly with explicit arguments — there is no HTTP request lifecycle for
an ALS store to attach to, and Temporal's own determinism/replay model
favors explicit arguments over hidden ambient state anyway. On the HTTP
client side, `@CurrentTenant()` (`platform/current-tenant.decorator.ts`)
reads `request.user.contextId` directly, once, per request — there's no
repository layer on that side consuming an ambient context either.
`platform/tenant-db.ts`'s `withTenantTransaction` is the same RLS + `SET
LOCAL app.tenant_id` mechanism as the other two services, just without
the ALS wrapper — `tenantId` is a plain parameter everywhere, always.

## Workflow-id-embeds-tenant is routing, NOT the security boundary

`agent-conv-{tenantId}-{conversationId}` — docs' own explicit framing:
"Workflow ID = tenant:session — observability/routing only, NOT the
security boundary." Safe by CONSTRUCTION, not by an explicit runtime
assert: `ConversationService` always builds the workflow id from the
CALLER'S OWN tenantId (from their verified JWT), never a client-supplied
one — a tenant can only ever reach a workflow whose id embeds their own
tenantId, because they have no way to make the server embed someone
else's.

## Prompt injection defense (docs Section 5.9) — one layer of several, not a complete answer by itself

`platform/prompt-injection.ts`'s `wrapUntrustedContent` wraps a user's raw
message in an explicit `<user_message>` delimiter before it's concatenated
into the prompt sent to Anthropic — a structural "this is data, not a
directive" signal, paired with a system-prompt sentence saying the same
thing explicitly. This does NOT prevent injection by itself; the other
layers already in place: `getSalesSummaryToolSchema` takes ZERO
caller-supplied arguments (the smallest possible attack surface for a
first tool — nothing an injected instruction could smuggle meaning
through), `tenantId` never comes from the model or the tool call, always
from the workflow's own argument chain back to the caller's JWT, and there
is no free-form SQL generation anywhere in this service (Layer A never
will have one, by the docs' own design).

## Second tool (`get_stock_level`) — a tool REGISTRY, not a growing if/else

`get_stock_level` (current available quantity for a SKU code, `catalog.skus`
joined to `catalog.lots`) is the first tool with a CALLER-SUPPLIED
argument — `get_sales_summary` takes none. `skuCode` is the only thing the
model may specify; `tenantId` is still never part of the exposed JSON
schema and never taken from the model's tool-call arguments, same
discipline as the first tool. Two tools is what earned
`run-agent-turn.activity.ts`'s `TOOLS` registry (`Record<name, {schema,
handler}>`) replacing what would have become an if/else chain — a third
tool would have made that chain genuinely unreadable; refactoring at two,
not one, matches this codebase's general "don't abstract until a real
second case shows up" discipline. `test/get-stock-level.e2e-spec.ts`
covers the case that matters most for a multi-tenant lookup keyed by a
caller-supplied code rather than an id: the SAME sku_code existing in two
different tenants must resolve independently per tenant, never cross-match.

## A real bug found by actually running this against Anthropic's live API (not by reading the code)

Temporal's DEFAULT Activity retry policy retried a genuine 401
(`ANTHROPIC_API_KEY` invalid/placeholder) three times before giving up —
three wasted real calls to Anthropic's production endpoint for a failure
that could never succeed by retrying. Fixed in
`run-agent-turn.activity.ts`'s `createMessage` helper: any Anthropic
`APIError` with a 4xx status OTHER than 429 is re-thrown as
`ApplicationFailure.nonRetryable(...)` (from `@temporalio/common`),
stopping the Activity's retry policy cold — same classification
discipline as connector-hub's `connector-http.ts` (429/5xx/network stay
retryable, other 4xx never do). Verified the fix for real: before, the
same placeholder key produced 3 real 401s per message; after, exactly 1.

## Real verification performed

Typecheck clean. `test/get-sales-summary.e2e-spec.ts` +
`test/role-isolation.e2e-spec.ts`: real Postgres, no mocks (today's-orders
math including the Vietnam UTC+7 day-boundary correction, read-yes/write-no/
cross-schema-no role boundary). `test/agent-conversation-workflow.e2e-spec.ts`:
real Temporal workflow/Activity/Update/Query semantics via
`@temporalio/testing`'s `TestWorkflowEnvironment` (an ephemeral, real
Temporal test server the SDK manages itself — no external Temporal server
needed in CI), `runAgentTurn` stubbed there on purpose since no automated
test should depend on a real paid Anthropic key; the idle-timeout
termination is proven via time-skipping, not a real 24h wait. Full live
smoke test against a real `temporal server start-dev` + a real worker
process + a real NestJS client: mint token → start conversation → send
message → real HTTPS round-trip to Anthropic's actual production endpoint
→ clean real 401 (proving the entire pipeline, not just isolated pieces) →
confirmed the retry-classification fix by observing exactly one API call
on the second attempt where the first had made three.

---

# `scripts/demo-e2e.sh` — the full cross-service story, one command

Starts all three services (backend-api, connector-hub, a real `temporal
server start-dev`, agent-orchestrator's worker + client) and walks through
onboarding → catalog → procurement → sales → invoicing → payment →
traceability → booking → AI assistant, entirely with real curl calls
against real running servers. Run it with `./scripts/demo-e2e.sh`; stop
everything with `./scripts/demo-e2e.sh --stop`. Servers are left running
after a successful run so a live demo can keep exploring (Swagger docs,
Temporal Web UI) past the scripted part.

**Exactly two things are mocked, nothing else**: the SePay bank transfer
itself (a hand-built webhook payload stands in for a real bank/SePay
account — real dedup, real invoice-number extraction, real forward into
`payment-reconcile` all still happen), and the LLM's language
understanding (`MOCK_LLM_RESPONSES=true` on the worker — see
`run-agent-turn.activity.ts`'s `runAgentTurnMocked`, which still calls the
SAME real tool functions against the SAME real Postgres data; only the
"which tool to call" step is keyword-matched instead of a real Claude
call). Every mocked LLM reply is prefixed `[MOCK]`.

**Two real bugs found by actually running this script, not by reading the
code:**
- `lsof -ti :PORT1 :PORT2` (space-separated) is not valid multi-port
  syntax — lsof treats the second `:PORT` as a separate filename argument
  and errors. Fixed to the correct comma-separated form: `lsof -ti
  :PORT1,PORT2`.
- The mocked LLM's keyword matching only recognized ACCENTED Vietnamese
  ("tồn kho", "hóa đơn"). The demo's own questions, typed in plain ASCII
  ("Con ton kho...", "Co hoa don..." — extremely common in real usage,
  not a contrived edge case), silently matched NOTHING and fell through
  to the wrong default answer every time. Fixed with `stripDiacritics()`
  (NFD-normalize + strip combining marks, `đ`/`Đ` folded by hand since
  they don't decompose that way) applied before matching — verified by
  re-running the exact same script end to end and by a dedicated
  regression test (`test/run-agent-turn-mocked.e2e-spec.ts`) that would
  have caught this before it ever reached a real demo.

---

# Fourth Layer A tool (`get_upcoming_bookings`) — extends coverage to Chân dung 2

`get_upcoming_bookings` (`db/migrations/0004_grant_booking_read.sql` grants
SELECT on `booking.bookings`/`booking.resources`) is the fourth tool and
fourth schema grant, following the exact same shape as
`get_outstanding_invoices`: zero caller-supplied arguments, a single query
(here an INNER JOIN, not a GROUP BY), capped at 20 results. It extends
real Layer A coverage from the sales/catalog/tax personas to Chân dung 2
(tourism/booking) tenants — "what's coming up" for a homestay/restaurant.

- **`held` (unconfirmed) bookings are deliberately excluded**, only
  `confirmed` ones show — a tentative hold isn't a commitment worth
  surfacing as "upcoming," the same distinction backend-api's own
  `booking-resource` module draws between the two statuses.
- Registered in the same `TOOLS` map and given its own keyword branch in
  the demo-only `runAgentTurnMocked` (Vietnamese "đặt bàn/đặt phòng/lịch
  đặt", diacritics-stripped same as the other branches).
- `test/role-isolation.e2e-spec.ts` updated the same way the catalog/tax
  grants were: the table just granted moves from the "cannot read" example
  to the "can read" list, plus its own cannot-insert check; the "cannot
  read an ungranted table" example moved to `procurement.suppliers` (still
  correctly denied).

Verified: typecheck clean, e2e tests pass for real Postgres (soonest-first
ordering, held/past bookings correctly excluded, empty-tenant case, cap
enforcement with 25 seeded bookings) and for the mocked-LLM path (a real
booking seeded via the admin connection shows up correctly in the `[MOCK]`
reply). Live smoke test against a real Temporal dev server + real
Anthropic endpoint confirms the 4-tool schema list is still well-formed
(clean 401 auth failure, not a malformed-request error) — same check
performed after every tool addition so far.

## Layer B (RAG) for agent-orchestrator — pgvector, Voyage AI, sample content only

Docs Section 5.1 names two retrieval layers for the AI assistant: Layer A
(the caller's own live business data, via constrained SQL tool-calling —
done first, 4 tools) and Layer B (general knowledge — tax rules,
formalization steps, FAQs — via embeddings). Picked as the next module
after the architecture audit: the most mission-aligned gap, since the
assistant answering "how do I register a household business" is closer to
the program's actual point than a 6th connector.

**Why Voyage AI, not OpenAI embeddings**: Anthropic has no embeddings
endpoint of its own; Voyage AI is Anthropic's own recommended embeddings
partner. Same "let key, I will input later" pattern as `ANTHROPIC_API_KEY`
— `VOYAGE_API_KEY`/`VOYAGE_API_BASE_URL`/`VOYAGE_EMBEDDING_MODEL`
(default `voyage-3.5`, 1024 dimensions) in `env.schema.ts`, `.env.example`,
`.env`, and CI, same as every other new env var in this repo.

**Why pgvector, not a separate vector DB**: one Postgres to operate, same
place every other schema in this database already lives, and drizzle-orm
0.45.2 already has native `vector()` column type + `cosineDistance()` query
support — no raw SQL needed. Required switching `docker-compose.dev.yml`'s
Postgres image from `postgres:18` to `pgvector/pgvector:pg18` (same
Postgres 18 base, extension added) — done carefully: existing data volume
reused (all pre-existing schemas survived), but the base-image swap left a
harmless-looking `collation version mismatch` warning (created under
collation 2.41, OS now provides 2.36) that Postgres itself documents as a
real correctness risk for indexes/comparisons on text columns if left
unaddressed — fixed with `ALTER DATABASE solodesk REFRESH COLLATION
VERSION` + `REINDEX DATABASE solodesk`, not ignored. CI's own Postgres
service container in `agent-orchestrator-ci.yml` switched the same way.

**`knowledge.chunks`** (migration `0005_add_knowledge_base.sql`) is the
first table in this database that ISN'T tenant-scoped — shared reference
content, same "no RLS, non-tenant reference data" shape as backend-api's
`tax.tax_rules`. `solodesk_agent` gets SELECT only; ingestion
(`scripts/ingest-knowledge.ts`, `pnpm ingest:knowledge`) writes exclusively
via `DATABASE_ADMIN_URL`, same admin-only-write discipline as every
migration in this repo.

**The sample content is deliberately NOT real Vietnamese tax/registration
law.** This is a household-business formalization program — fabricating
plausible-sounding regulatory text (specific decree numbers, thresholds,
fees) and letting it get treated as authoritative would be genuinely
harmful, not just a scope shortcut. `ingest-knowledge.ts`'s 4 sample
documents are generic, hedge explicitly, cite no specific figures, and
carry their own "SAMPLE — not official guidance" disclaimer baked directly
into both title and content — so the disclaimer survives even if a chunk
is later quoted out of context. Replace this array with a real, sourced
corpus before this is ever used for genuine guidance. The system prompt
was also updated to tell the model to treat `search_knowledge_base`
results as reference material, not live authoritative data, unlike the
Layer A tools.

**Mock-mode gets a genuinely different retrieval strategy, not a fake
stand-in**: `search_knowledge_base` (the real tool) calls Voyage to embed
the query, then orders `knowledge.chunks` by `cosineDistance`. The
`MOCK_LLM_RESPONSES` path can't call Voyage either (same "no real 3rd-party
call in demo mode" reasoning as `ANTHROPIC_API_KEY`), so it uses
`searchKnowledgeBaseByKeyword` instead — a real, word-level,
diacritics-stripped keyword search against the same table, no embedding
call. Two real strategies, same honesty line this repo already draws
elsewhere (mock the 3rd party, never fake the retrieval itself).

**Bugs found and fixed while building this, in order**:
1. First attempt at `searchKnowledgeBaseByKeyword` did whole-phrase
   `ILIKE '%entire user question%'` — would never match real content
   since a full natural-language question essentially never appears
   verbatim in reference text. Caught by writing the mock-mode test BEFORE
   assuming the implementation worked. Rewritten to word-level matching
   (any query word present, scored by match count).
2. That rewrite needed diacritics-insensitive matching (Vietnamese typed
   without accents against accented reference content, or vice versa) —
   the exact same problem already solved once for the other mock branches'
   keyword matching. Extracted `stripDiacritics()` to a shared
   `src/platform/text.ts` instead of duplicating it, and deleted the
   now-redundant copy in `run-agent-turn.activity.ts`.
3. Writing that shared file hit the SAME literal-combining-mark-characters
   pitfall this repo's history already documents for `stripDiacritics`'s
   regex — my typed `̀-ͯ` rendered as the literal glyphs again,
   not the escape sequence. Fixed the same documented way: wrote the file
   via a Python script with the explicit ASCII escape, verified byte-for-
   byte correct with a hex dump before trusting it.
4. Found (unrelated to this task, while reading `get-outstanding-invoices.tool.ts`
   for a schema reference) the exact same float-money bug the backend-api
   audit had just fixed, but in agent-orchestrator: `get-outstanding-invoices.tool.ts`
   and `get-stock-level.tool.ts` both did `Number(a) - Number(b)` display
   arithmetic instead of exact decimal math. Copied backend-api's
   `money.ts` helper into this service too (copied, not shared via a
   package, same YAGNI convention as this service's other platform files)
   and fixed both sites — a small, cheap, directly-analogous fix, done
   while already in the neighborhood rather than filed away for later.

**Testing without a real Voyage key**: `test/knowledge-base.e2e-spec.ts`
tests the pgvector ordering/index/schema plumbing directly via
`searchByEmbedding()` with hand-supplied vectors (a `searchKnowledgeBase`
refactor split the embedding call from the vector query specifically for
this), never calling Voyage — same "not live-verified" precedent as this
repo's 3rd-party connector adapters. `knowledge.chunks` has no tenant
column to scope fixtures by, so every test fixture uses a unique per-run
title marker and is deleted in `afterAll`, avoiding the cross-run
pollution a shared, non-tenant-scoped table would otherwise accumulate.

Verified: typecheck clean across all 3 services, full e2e suites green
(backend-api 49/49, connector-hub 12/12, agent-orchestrator 31/31),
migration 0005 applied against the live dev database, all 5 dev processes
restarted cleanly after the Postgres image swap. Not yet run: the actual
ingestion script and a live semantic search, both blocked on a real
`VOYAGE_API_KEY` — same "let key, I will input later" state as every other
placeholder credential in this repo.

## Lazada — 6th connector, closes the marketplace trio

Picked as the next module after Layer B RAG shipped: same proven
HMAC-signing family as `shopee.adapter.ts`/`tiktok-shop.adapter.ts` (a
third data point, not a new risk category), and it's a cleaner milestone
than an arbitrary Nth pick — all 3 documented marketplace connectors
(Shopee, TikTok Shop, Lazada) are now real. Considered ViettelPost instead
(would close the shipping trio the same way), but Lazada was lower-risk:
ViettelPost's real API leans on numeric province/district/ward lookup
codes that would need to be fabricated to build a `createShippingOrder`-
style method, the same "confidently-wrong code without a way to verify
it" risk category e-invoice/Booking.com were already passed over for.
Lazada's Open Platform API needs no such lookup-table data — HMAC-signed
REST, same shape as its two siblings.

Two real differences from Shopee/TikTok Shop's signing, not shortcuts:
Lazada signs with UPPERCASE hex (not lowercase), and its params include
`sign_method`/millisecond (not second) timestamps. `lazada.adapter.ts`'s
`getSellerInfo`/`getOrderList` mirror the other two marketplace adapters'
method shapes (`getShopInfo`/`getOrderList`) for consistency across all
three. NOT live-verified against a real Lazada seller account — same
disclaimer as every other connector here, confirm against Lazada's
sandbox once real credentials are entered.

Verified: typecheck clean, connector-hub e2e suite green (12/12
unchanged — no adapter here gets a live-hitting e2e test, same precedent
as GHTK/Shopee/TikTok Shop), dev server hot-reloaded cleanly
(`LazadaModule dependencies initialized`).

## ml-analytics — the 4th deployable, first non-TypeScript service

Picked as the next module after Lazada: the biggest remaining gap in
README's "not yet built" list, and the only one with an existing, real
data source to work from (`sales.orders`) rather than needing design/UX
input (mobile/web) or unbuilt infra (SNS/SQS, ClickHouse — docs Section
4.3/17 name these as ml-analytics's eventual real path, not needed for a
first cut that just proves the service/role/calling-convention).

**Scope, deliberately cut down from docs Section 8's target stack**
("pandas/statsmodels/prophet, Vietnamese Whisper fine-tuning"): this first
cut is one endpoint, `GET /v1/forecast/:tenant_id`, using a linear-trend
least-squares fit (`numpy.polyfit`) over the tenant's own confirmed
`sales.orders` history — a real, defensible statistical baseline, not
Prophet/ARIMA and not a fabricated number. Whisper/STT fine-tuning isn't
touched at all. Both are named, not silently dropped — same "documented
scope cut" discipline as every other explicit scope decision in this repo
(LiteLLM gateway, the e-invoice connectors, Booking.com).

**Why Python here specifically, not another TS service**: docs Section 8's
own rationale ("genuinely different ecosystem — pandas/statsmodels/
prophet, Whisper fine-tuning") — this is the one module where the target
tooling itself isn't in Node's ecosystem. Structured to mirror the other 3
services' conventions as closely as a different language allows: FastAPI
+ asyncpg (not SQLAlchemy — YAGNI until real complexity needs an ORM),
`pydantic-settings` as the zod/`env.schema.ts` equivalent, a hand-written
`db/migrate.py` applying `db/migrations/*.sql` and tracked in the SAME
shared `public.schema_migrations` table the other 3 services already use
— confirmed by querying it directly before assuming this would work; all
4 services' migration filenames just need to stay distinct, same
convention already holding across 20+ prior migrations.

**`solodesk_ml`**: SELECT-only on `sales.orders`, same least-privilege
role-per-service pattern as the other 3, same `SET LOCAL app.tenant_id`
(via parameterized `set_config`, correct from day one — the other 3
services all had to fix a raw-string-interpolation version of this later,
see the architecture-audit section above; no reason to introduce that bug
here first).

**Service-to-service auth**: `INTERNAL_SERVICE_TOKEN`, the SAME shared
secret backend-api's `InternalServiceGuard` already uses for
connector-hub → backend-api — this is genuinely the 2nd consumer that
guard's own doc comment said to "revisit before a second consumer needs
it." Confirmed the same shape (pre-shared secret, constant-time compared —
`hmac.compare_digest` in Python, `timingSafeEqual` in Node) generalizes
fine without a redesign; ml-analytics has no per-user JWT path at all,
since it's never called except from inside an agent-orchestrator Temporal
Activity (docs Section 5.5's rule — the same gap `cxgenie-be`'s raw
synchronous HTTP calls to `cxgenie-core-ai` left open, avoided by
construction here since the ONLY call site, `get-sales-forecast.tool.ts`,
already runs inside `run-agent-turn.activity.ts`, itself an Activity).

**No CI workflow for this service.** Not an oversight: docs Section 17.3
already names "a Python build/publish action for ml-analytics" as
genuinely missing from this org's shared `qnsc-ci` composite actions —
that's an external repo this session can't add to, and writing an
`ml-analytics-ci.yml` that references a nonexistent action would be a
CI file that fails on its first run, worse than no file. Tests run via
`pytest` locally; automate once that action exists.

**Bugs found and fixed while building this**:
1. `pytest` failed with `RuntimeError: Event loop is closed` on the 2nd/3rd
   async test — `app/db.py`'s asyncpg pool is a module-level singleton
   (correct for the real running app: created once, reused for the
   process's lifetime), but pytest-asyncio's default per-test event loop
   meant test 2 tried to reuse a pool created under test 1's already-closed
   loop. Fixed by setting `asyncio_default_fixture_loop_scope`/
   `asyncio_default_test_loop_scope = session` in `pytest.ini`, not by
   changing the pool's design (which is correct for production).
2. My own `test_increasing_trend_projects_forward` failed on
   `400.00000000000006 != 400.0` — floating-point imprecision in the
   linear-regression fit itself, exactly the kind of thing a strict `==`
   shouldn't assert on for a statistical (not stored-money) computation.
   Fixed the test with `pytest.approx`, not the forecast math — a forecast
   is inherently approximate, unlike the exact-decimal money.ts guarantees
   this repo enforces for actual financial records.
3. Manual smoke test (a real conversation, `MOCK_LLM_RESPONSES=true`,
   asking a Vietnamese forecast question) first got a REAL 401 from
   Anthropic instead of the mocked reply — a stale worker process left
   over from a previous dev-server restart (not killed by an earlier
   `pkill`, timing-raced with a respawn) was still polling the same
   `agent-tasks` task queue without `MOCK_LLM_RESPONSES` set, and Temporal
   load-balanced the task to it instead of the freshly-restarted one. Same
   zombie-worker-process class of issue already documented in this file's
   "prepare setup all" section — killed the stale PIDs, confirmed exactly
   one worker process before retrying, then got the real mocked forecast
   reply back correctly.

Verified: typecheck clean (agent-orchestrator), `pytest` 14/14 (ml-analytics:
forecast math, real-Postgres API tests, role isolation), agent-orchestrator
e2e 32/32 (the new tool's test covers only the deterministic config-error
path — no live ml-analytics dependency in CI, see above). Real end-to-end
manual smoke test: a real Vietnamese conversation message through the
actual running `agent-conversation` workflow → `get_sales_forecast` tool →
real HTTP call to a real running ml-analytics instance → real Postgres
query via `solodesk_ml` → real linear-trend forecast computed from real
seeded order data → correct `[MOCK]`-prefixed reply, confirming the full
4-service chain actually works, not just each piece in isolation.

## apps/web-buyer-portal — first frontend, scoped to what's already fully spec'd

Picked as the next module after ml-analytics. Previously avoided all
frontend work in this engagement on the grounds that mobile/web need
design/UX input that isn't mine to guess at — that's still true for most
of it, but docs Section 8/12 name 3 SPECIFIC Next.js apps
(`web-accounting`, `web-b2g-dashboard`, `web-buyer-portal`), and
`web-buyer-portal`'s own doc comment is "buyer-side order confirmation,
QR traceability." The QR-traceability half is fully spec'd already by a
real, existing, public backend endpoint
(`GET /v1/trace/:lotId` — `@Public()`/`@SkipTenantContext()`, "the page a
buyer reaches by scanning a QR code") — zero business-flow ambiguity, so
it's the one frontend slice safe to build without user design input.
Deliberately did NOT build "order confirmation" in this same app — that
needs real flow decisions (what triggers it, what it shows, auth or not)
this session shouldn't invent.

**Design, before code**: the user explicitly asked to use the
`ui-ux-pro-max` skill first, with reusable components for consistency
across the (eventual) 3 apps. Ran it properly — `--design-system` +
targeted `--domain color`/`typography`/`ux`/`product` searches + `--stack
nextjs` — and persisted `design-system/solodesk/MASTER.md` +
`design-system/solodesk/pages/buyer-portal-trace.md`. Two of the tool's
own automatic picks were wrong for this product and manually overridden,
with the override reasoning written directly into MASTER.md (per the
skill's own "verify fit before applying" instruction, not a silent
swap):
1. Default color aggregation was generic SaaS trust-blue — re-queried
   `--domain color` for "agriculture organic earthy trust" and got
   Agriculture/Farm Tech's earth-green + harvest-gold palette instead, a
   much better fit for a coffee/produce-lot provenance page and
   genuinely NOT generic SaaS blue (the user's own stated goal).
2. Default typography was "Fira Code / Fira Sans" (mood: dashboard, code,
   technical) — fine for an admin analytics screen, wrong for a
   consumer-facing trust page or general staff tools. Swapped to
   "Corporate Trust" (Lexend + Source Sans 3), explicitly designed for
   readability/accessibility, a better fit for all 3 planned apps.
3. Default page PATTERN was "Feature-Rich Showcase" — a marketing/
   conversion landing-page shape (hero, feature grid, social proof, CTA
   repetition). None of the 3 planned apps are marketing pages; all 3 are
   utility tools someone reaches by a direct link or login. Documented
   this as a structural mismatch, not something to patch around, and
   wrote the actual page pattern (header → single result card → footer)
   as a page-level override instead.

Reusable components (`components/Badge.tsx`, `EmptyState.tsx`,
`SiteHeader.tsx`, `SiteFooter.tsx`) match MASTER.md's specs exactly (badge
label never wraps, one atomic `role="status"` on async updates, empty
state always has a title+next-action, never a blank screen) — meant to be
copied into `web-accounting`/`web-b2g-dashboard` once those exist, same
"copied, not shared via a package" convention this repo already uses for
cross-service platform code.

**A real bug found via a manual smoke test, not left unexplained**:
`notFound()` in `/trace/[lotId]/page.tsx` returns a SOFT 404 (HTTP 200 +
`<meta name="robots" content="noindex">`), not a real 404 status —
confirmed via `curl -sD -` against both `next dev` and a real `next
build && next start` production server, so not a dev-mode artifact.
Root cause, found by reading Next 16's own bundled docs
(`node_modules/next/dist/docs/`, since the framework's own
auto-generated `AGENTS.md` warns training data may be stale for this
version): having a `loading.tsx` alongside the route makes Next.js wrap
the page in an implicit Suspense boundary, so the response starts
streaming as `200` before this component's `notFound()` call can run —
documented, known Next.js behavior ("the status code of the response
cannot be updated" once streaming starts), not a bug in this code. A real
404 status would need the not-found check to run in `proxy` (Next 16's
renamed middleware) before the route streams at all. Decided this
soft-404 is the right trade-off HERE, not a gap to close: this page is
reached only via a direct QR-code link (never crawled — the `noindex` tag
already handles that), so the loading-skeleton UX for real mobile buyers
on slow connections matters more than a status code nothing but a
compliance audit would check. Documented in a code comment on the page
itself, not left as a silent surprise for whoever touches this file next.

**Tests**: `test/trace.spec.ts` (Vitest) — real backend-api, real
Postgres, no mocks, same discipline as every other service. This app has
no DB role of its own (pure HTTP client of backend-api's public
endpoint), so `DATABASE_ADMIN_URL` here is TEST-FIXTURE-SEEDING ONLY
(seeds the full real tenant → sku → lot → lot_traces chain
`TraceabilityService.publishLotTrace` would produce), never something the
running app connects with. Covers: real published-lot data round-trips
correctly, a lot with no supplier comes back with `supplierName: null`
(not a crash), the not-found path throws `LotTraceNotFoundError` for a
real nonexistent lot, `sourceChannelLabel()`'s known-value mapping and
its title-case fallback for an unknown value (never renders a raw
snake_case string), and `formatDate()`'s `vi-VN` formatting.

Verified: `next build` clean (real TypeScript check via Next's own
pipeline, since raw `tsc` can't see Next's auto-generated route-param
types), ESLint clean, Vitest 7/7, and two real manual smoke tests against
the actual running backend-api — a real published lot (rendered correctly,
Vietnamese `sourceChannel` label mapped) and a nonexistent lot (correct
not-found UI, confirmed soft-404 behavior as described above).
