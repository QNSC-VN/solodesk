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

## Invoice PDF generation (BullMQ) — two real bugs, one of them severe

Picked as the next module after web-buyer-portal: docs explicitly name
this ("Background jobs within a Node service | BullMQ (on Valkey/
ElastiCache) | PDF invoice generation, filing-deadline reminders, QR
traceability image resizing"), Valkey is already in the stack (the
auth-token denylist already uses it), and it's fully spec'd — no design/
UX guessing needed, unlike a 2nd frontend app. `POST /v1/invoices/:id/pdf`
enqueues; `src/worker-pdf.ts` (separate process, same split as
agent-orchestrator's Temporal worker/client) processes; `GET
/v1/invoices/:id/pdf` downloads once generated. `InvoicePdfService.
renderInvoicePdf` is split from the queue/worker plumbing so it's directly
testable without a live Worker — same shape as agent-orchestrator's
`searchByEmbedding`/`searchKnowledgeBase` split. BullMQ, not Temporal: a
DIFFERENT tool on purpose — Temporal is for agent-orchestrator's durable,
long-running AI conversations; this is a short-lived, fire-and-retry job
with no multi-day durability need, and docs' own rationale for BullMQ
here is exactly "Valkey is already in the stack... works unchanged."

**Tenant-isolation gap caught before shipping**: the job-status endpoint
(`GET /v1/invoices/:id/pdf/jobs/:jobId`) initially had no ownership check
at all — any authenticated caller could poll ANY tenant's `jobId` and
learn its state, since the URL param isn't scoped by tenant the way the
PDF file path is. Fixed by comparing the job's own stored `tenantId`
(BullMQ job data, not something an attacker controls) against the
caller's session tenant before returning state.

**Bug 1 — NestJS DI silently returns `undefined`, first Temporal call to
mix `tsx` with a real Nest DI container in this repo.** `worker-pdf.ts`
originally ran via `tsx watch` (matching agent-orchestrator's worker
script's tool choice) but crashed on the first real job:
`this.invoiceService.getInvoice is not a function`. Root cause: `tsx`
(esbuild) doesn't reliably emit TypeScript's `emitDecoratorMetadata`
output, which Nest's constructor-based DI depends on for any class with
no explicit `@Inject()` token — every such dependency came back
`undefined`, with NO error at boot, only surfacing when a real job ran.
agent-orchestrator's own `tsx`-run worker never hit this because it
deliberately never boots a Nest DI container at all (plain functions,
explicit `tenantId` arguments) — this is genuinely the first script in
this repo combining `tsx` with `NestFactory`. Fixed by switching to
`ts-node` (real `tsc`, correct metadata emission): `node --watch -r
ts-node/register/transpile-only src/worker-pdf.ts` for dev,
`node dist/worker-pdf.js` (via `nest build`, confirmed it actually emits
`dist/worker-pdf.js` alongside `dist/main.js`) for production. Found by
running a real job through a real worker process, not by reading the code
— the e2e tests didn't catch this because they construct
`InvoicePdfService` directly with manually-wired dependencies, bypassing
Nest's DI (and `tsx`'s metadata gap) entirely, same style as
`invoice-tax.e2e-spec.ts`.

**Bug 2 — pdfkit's built-in fonts have ZERO Vietnamese glyph coverage,
and the obvious npm fix doesn't work either.** This is a 100%-Vietnamese
document; the first generated PDF, downloaded and actually read (not
assumed correct), rendered as "HÓA  N" / "S Ñ hóa  ¡n" — every diacritic
and đ/Đ silently dropped, garbling the entire invoice. pdfkit's standard-
14 fonts (Helvetica etc.) are WinAnsi-encoded, no Vietnamese coverage at
all. First fix attempt — `@fontsource/noto-sans`'s "vietnamese" subset
WOFF2 — rendered WORSE: verified directly that this file contains ONLY
Vietnamese-specific glyphs (đ/ơ/ư and precomposed diacritic vowels), NO
base Latin a-z at all, by design (Google Fonts ships per-script subsets
meant to be layered together via multiple `@font-face` `unicode-range`
rules in a browser, not used standalone). pdfkit needs ONE file with
every glyph the document uses. Real fix: vendored Google Fonts' actual
complete Noto Sans variable font (`assets/fonts/NotoSans-VF.ttf`, ~2MB,
full Unicode coverage in one file, fetched once from
`github.com/google/fonts` and committed, not fetched at runtime) and
registered it in pdfkit via `doc.registerFont()`. Verified by rendering
"Xin chào, đây là hóa đơn ưu đãi! HÓA ĐƠN" in isolation and reading the
resulting PDF back before trusting the real invoice template, then
re-verified the real invoice end-to-end the same way.

Verified: typecheck clean, e2e suite 53/53 (4 new: real pdfkit rendering
produces a valid non-trivial PDF, cross-tenant rendering is rejected,
generated-file read/write round-trips on a real temp filesystem, and
BullMQ enqueue carries the right job data and rejects an unowned
invoice), `nest build` produces `dist/worker-pdf.js`. Real manual
end-to-end smoke test, twice (once exposing each bug, once confirming
the fix): a real invoice, a real HTTP enqueue call, a real separate
worker process picking up the job from real Valkey, a real rendered PDF
written to a real local disk path, downloaded over real HTTP, and
visually read back to confirm every Vietnamese character is correct.

## Idempotent invoice issuance — closing a real pre-pilot gap, and a bug found while closing it

Picked after the user asked directly whether the backend flow was MVP-
demo-done — checked docs Section 11's own pre-pilot risk list against the
actual code (not memory) and found `issueInvoice` was the one item with
no idempotency key at all: a dropped connection mid-issuance and a client
retry got `409 INVOICE_ALREADY_ISSUED`, not the actual invoice —
functionally different from `placeOrder`'s real `withIdempotency` handling
of the exact same class of failure. Fixed to the identical shape:
`issueInvoice(tenantId, orderId, idempotencyKey)`, the whole body (order
lookup, tax calc, cumulative-threshold check, and the invoice insert)
inside one `withTenantTransaction` + `withIdempotency`, same as
`OrderService.placeOrder`. `InvoiceDrizzleRepository.create` lost its own
internal `withTenantTransaction` and now takes `tx` as a mandatory
trailing param (same convention as `OrderDrizzleRepository.create`) — it
had exactly one caller, safe to change. `POST /v1/invoices` now requires
an `Idempotency-Key` header, same shape as `POST /v1/orders`.

**A second, more interesting bug found while wiring the retry test**:
`withIdempotency`'s cached-replay path returns `responseBody` straight
from a `jsonb` column — any `Date` field on the ORIGINAL result (e.g.
`Invoice.issuedAt`) round-trips through JSON as a plain ISO string, so a
cache-hit replay silently returned a string where callers expect a real
`Date`. This isn't invoice-specific — it's a `withIdempotency`-wide gap
that also affects `placeOrder`'s cached `Order.createdAt`, just never
exercised by a test before. Concretely, it would have broken
`invoice-pdf.service.ts`'s `issuedAt.toLocaleDateString()` the moment a
real client actually retried invoice issuance with the same key — found
by writing the retry test, not by reading the code. Fixed generically in
`src/platform/idempotency.ts` (`reviveDates()`, an ISO-8601-string-shaped
regex walk over the cached value before returning it) rather than
invoice-specifically, since every idempotent operation in this codebase
shares the same cache mechanism and would hit the same bug.

Verified: typecheck clean, e2e 54/54 (new: a genuine-second-request-with-
different-key case still correctly rejects with `409`, same as before;
a same-key retry returns the identical invoice — same `id`/
`invoiceNumber`/`issuedAt` — confirmed as a real `Date` instance, not a
string, and confirmed exactly one row exists in `tax.invoices` for that
order afterward, not two). Real manual HTTP smoke test against the live
dev server: issued a real invoice, retried with the same
`Idempotency-Key` and got byte-identical JSON back (not a 409), then
confirmed a genuinely different key on the same already-issued order
still correctly returns `409 INVOICE_ALREADY_ISSUED`.

Remaining items from docs Section 11's pre-pilot list, still open (not
touched by this fix): undo + audit log, real login/session-recovery (no
AuthService wired, dev-token-minting only), returns/exchanges linked to
an order, and confirming cash-specific reconciliation is modeled
distinctly from the general payment-recording path.

## AI-guided onboarding conversation — docs Section 5.4 made real, spanning all 3 services

Picked after the user asked to build one complete end-to-end AI-driven
flow for the product's actual target audience (elderly/non-technical
household-business owners in the Gia Lai formalization program): a new
conversation `mode` that walks a fresh tenant through setup step-by-step
in plain Vietnamese — business type/industry, business name, an offer to
connect SePay, and adding a first product — matching docs Section 5.4's
own description almost verbatim ("agent proposes a step → calls a broker
tool to execute it → calls a read-only verification endpoint → reports
the outcome... the AI agent never sees a raw secret").

**The security boundary this had to preserve, by construction, not by
convention**: the existing default assistant conversation is read-only
because `solodesk_agent`'s Postgres grants are SELECT-only, full stop.
Onboarding genuinely needs to WRITE (create/update a tenant's profile,
add a SKU, store a SePay credential) — giving the regular assistant
conversation that capability, even gated by careful prompting, would
have been the wrong shape; a jailbroken or confused model in an ordinary
support chat must never be able to touch data. Solved by making `mode:
'assistant' | 'onboarding'` a Temporal workflow argument, fixed once when
`agentConversationWorkflow` starts and never changed mid-conversation —
`toolsForMode()`/`systemPromptForMode()` in `run-agent-turn.activity.ts`
select an entirely separate `ONBOARDING_TOOLS` registry + system prompt,
never merged into the default `ASSISTANT_TOOLS`. The only way to reach a
write-capable conversation is to explicitly start one with `mode:
'onboarding'` (`POST /v1/conversations`) — the default stays exactly as
read-only as before.

**Writes still never touch another service's schema directly.**
agent-orchestrator's Postgres role is read-only by design (see above) —
so the 3 new tools (`set_business_profile`, `add_first_product`,
`connect_sepay`) call backend-api's/connector-hub's own HTTP APIs, the
same `INTERNAL_SERVICE_TOKEN` + `InternalServiceGuard` + `@Public()` +
`@SkipTenantContext()` shape already established for connector-hub→
backend-api (SePay forwarding) and agent-orchestrator→ml-analytics (sales
forecast) — now proven to generalize a second and third time. **connector-hub
is a receiver of this pattern for the first time** (previously only ever
a sender) — `InternalServiceGuard` copied over verbatim, same
constant-time comparison.

**Narrowed the actual new-capability surface by checking what already
existed first**: `POST /v1/tenants` was already `@Public()`/
`@SkipTenantContext()` (pre-existing, tenant creation itself needed no
new endpoint) — the real new surface was just tenant PROFILE UPDATE (no
update method existed before: `TenantService.updateProfile`, new
`internal/onboarding/tenants/:tenantId/profile` route), SKU creation
(reused `CatalogService.createSku` as-is, just a new tenant-explicit
entry point), and vault credential SET (reused `VaultService
.setCredentials` as-is, same reasoning). `TenantService.updateProfile`
deliberately does NOT call `runWithTenant` — `tenants` isn't RLS-scoped
(see this file's top rule), matching `createTenant`/`getTenant`'s
existing shape; the new SKU and vault-credential routes DO call
`runWithTenant(tenantId, ...)` first, since both those tables are
RLS-scoped and there's no per-request middleware entering that context
for a machine caller.

**Mock mode needed a turn-numbered state machine, not a single keyword
branch.** Every other mocked tool call in this codebase answers one
question per turn; onboarding is a real multi-turn flow with no NLU to
drive branching in demo mode. `runOnboardingTurnMocked` counts
`turn = history.length / 2` and advances through a fixed 5-step sequence
(industry → legal name → SePay yes/no → first product → completion
summary), calling the exact same real tool functions against the exact
same real Postgres/HTTP endpoints as the non-mocked path — same "mock
mode only stands in for the one thing that costs real money" discipline
as every other mocked path in this codebase, never a fabricated outcome.

**A known, accepted demo-mode limitation, reasoned through and left
as-is**: the mock industry classifier's keyword list checks
`food_beverage` before `agriculture`, so "Toi ban ca phe rang xay, trong
ca phe" (selling roasted coffee, ALSO growing coffee) matches
`food_beverage` even though "ca phe rang" more specifically suggests
`agriculture`. Not fixed — the real Claude model in non-mock mode
handles this correctly via genuine language understanding; the mocked
path is a demo stand-in, not the real classifier, and sharpening its
keyword-priority order buys nothing for actual production behavior.

**A retroactive CI gap found and fixed while adding this feature's own
env vars**: `agent-orchestrator-ci.yml` was missing `ML_ANALYTICS_BASE_URL`
and `INTERNAL_SERVICE_TOKEN` from the ml-analytics module — never caught
because this service's e2e tests don't boot the full Nest app, only the
config-error path for tools that need those vars. Added them alongside
this feature's own new `BACKEND_API_BASE_URL`/`CONNECTOR_HUB_BASE_URL`.

Verified: typecheck clean across all 3 services, full e2e suites green
(backend-api 57/57, connector-hub 12/12, agent-orchestrator 35/35). Real
manual end-to-end smoke test against the live dev stack (not just unit-
level service tests): a fresh placeholder tenant → a real 5-turn
`mode: 'onboarding'` conversation → real tenant profile update (industry
+ legal name), real SKU creation, real encrypted SePay vault credential
write — each confirmed via direct DB/API queries afterward, not assumed
from the conversation reply alone — and confirmed the new internal
endpoints correctly reject an unauthenticated request without mutating
any data. Also confirmed the refactor to `run-agent-turn.activity.ts`
(renaming `TOOLS`→`ASSISTANT_TOOLS`, `SYSTEM_PROMPT`→
`ASSISTANT_SYSTEM_PROMPT`, splitting the mock dispatcher) didn't break
the pre-existing default assistant-mode flow: started a fresh default-mode
conversation and confirmed a real stock question still gets the correct
mocked reply.

## Real login — password + Google signup/signin, email verification

Picked as the next module after the onboarding-conversation feature shipped:
that feature assumes a real user can reach it, but until now every token in
this repo came from `scripts/mint-dev-token.ts` (dev/test-only, hard-blocked
in production) and `POST /v1/tenants` created a tenant with no owning user
at all. This closes docs Section 11's "real login/session-recovery" gap —
the one that actually blocked a non-technical pilot user from reaching
anything built so far.

**Scope decision, asked and answered explicitly before writing any code**:
the user asked, as solution-architect-lead brainstorming, whether this
should be built in the shared `@qnsc-vn/identity` package (`qnsc-app-platform`
repo) instead, so rally/opshub could reuse it. Answered no, build it in
SoloDesk's own repo: no second consumer exists for a self-serve "signup
creates your own new tenant" flow — rally/opshub are enterprise B2B,
admin-creates-workspace-then-invites — same "two call sites don't earn a
shared abstraction yet" discipline as `INTERNAL_SERVICE_TOKEN`'s own
"revisit before a second consumer needs it" note, and `qnsc-app-platform`
is a separate repo/package version this session can't iterate on directly.

**What's genuinely reused from `@qnsc-vn/identity@6.0.0`, unchanged** —
confirmed by reading the actual compiled package (`.d.ts` AND `.js`, not
assumed): `signAccessToken`/`generateRefreshToken`/`hashToken`/
`parseTtlSeconds` (exported standalone functions — `scripts/mint-dev-token.ts`
already calls `signAccessToken` directly, so these were never private), and
the real `AuthService`'s `refresh`/`logout`/`logoutAll`/`getMe`/
`updateProfile` methods (real refresh-token rotation with theft detection,
access-token denylist) once its ports are bound to real tables. `AuthSession
.ssoProvider: string | null` and `JwtPayload.authMethod: 'password' | 'sso'`
are already first-class fields in the package's own domain types — password
sessions are an anticipated case, just one the package has no verification
code for at all.

**Why the package's own SSO login methods (`ssoLogin`/`ssoLoginFromConnection`)
could NOT be used for Google login, found by reading the compiled `.js`, not
guessed**: `ProvisioningConnection.workspaceId: string` is a single FIXED
workspace id per `sso_connections` row — the package's whole JIT-provisioning
model is "join a pre-existing, admin-configured workspace," with no path for
"a brand-new user's first login creates their own new tenant." `AuthService`'s
`createSession`/`toLoginResult` (the actual token-minting logic) are also
private, reachable only through `ssoLogin`/`ssoLoginFromConnection`/`devLogin`
— none of which fit. `SessionMinter` (`src/modules/auth/application/
session-minter.ts`) mints sessions itself using the SAME exported primitives
+ the SAME injected `@nestjs/jwt` `JwtService` `AuthService` uses internally
(confirmed via `grep this\.jwt` in the compiled `auth.service.js`: no
per-call algorithm/key options, meaning `JwtModule`'s registered defaults
ARE the signing config) — so every token minted here is byte-for-byte what
`JwtStrategy` already verifies, and the real `AuthService.refresh`/`logout`/
`logoutAll` work on these sessions afterward exactly as if the package had
minted them itself.

**A real architectural gap found while wiring Google login for a RETURNING
user, not by reading the code**: `tenant_members` is correctly RLS-scoped
(`tenant_id = current_setting('app.tenant_id', true)`), which means it
structurally CANNOT be queried by `user_id` alone before any tenant context
exists — exactly the question "which tenant does this user belong to"
needs answering AT login time, before one can be established. Fixed with
`identity.user_tenant_memberships` (`user_id`, `tenant_id`, no RLS) — same
deliberately-denormalized-no-RLS-index pattern this repo already uses for
`traceability.lot_traces`, maintained alongside `tenant_members` in the
same transaction (`TenantMemberDrizzleRepository.add`), used only by the
new `findTenantIdsForUser` port method. Never a place to bypass RLS —
tenant_members itself is untouched and still fully RLS-enforced; this is a
narrow, purpose-built lookup index, not a workaround.

**A real transaction/RLS bug the Google-login e2e test caught, not manual
review**: the first version of `loginWithGoogle` opened one outer
`db.transaction(async (tx) => {...})` and threaded that `tx` through to
`memberRepository.add(..., tx)` for a brand-new user's owner membership.
`withTenantTransactionOrReuse`'s own contract is "reusing a provided `tx`
assumes the CALLER already set `app.tenant_id` on it" (true for every
existing caller, which all open their OWN `withTenantTransaction` first) —
but a plain `db.transaction()` never sets it, so the INSERT hit
`tenant_members`' RLS check with `current_setting('app.tenant_id', true)`
literally unset, and Postgres rejected it with `invalid input syntax for
type uuid: ''` (the RLS policy's own cast, not a bound query parameter).
Fixed by NOT wrapping `loginWithGoogle` in one outer transaction at all —
`upsertBySsoIdentity`/`tenantRepository.create`/`memberRepository.add` each
open their own correctly-scoped transaction when called with no `tx`,
matching `signupWithPassword`'s own already-accepted trade-off (tenant
creation there isn't inside its transaction either, same "onboarding path"
precedent as the pre-existing `TenantController.createTenant`) — an
orphaned placeholder tenant on a mid-flight crash is tolerable; a wrong RLS
context on a real write is not.

**Password hashing**: `argon2` (argon2id) — OWASP's current recommended
default, new real dependency; the package has zero password-auth code of
any kind. **Google verification**: hand-rolled `GoogleTokenVerifier`
(`src/platform/auth/google-token-verifier.ts`), same shape as the package's
own `EntraTokenVerifier` (`jose`'s `createRemoteJWKSet` + `jwtVerify`
against Google's real JWKS, checking issuer + audience), deliberately NOT
routed through the package's `OidcTokenVerifier`/`ConnectionRegistry`
broker — that machinery is built for admin-configured, per-workspace
connections this product doesn't have; hand-verifying Google directly
avoids forcing a single global consumer IdP through machinery designed for
a different shape. Same injectable `jwksResolver` testability pattern as
`EntraVerifierOptions` — the e2e test signs a fake token with a locally
generated keypair, no real network call.

**Email**: `EmailService` (`src/platform/email.service.ts`), one `fetch`
POST to Resend's API, no SDK dependency — same "let key, I will input
later" pattern as every other 3rd-party credential in this repo.
`RESEND_API_KEY` unset (local dev/test) logs the email (including the
verification/reset link) via `Logger.warn` instead of throwing, so manual
testing never needs a real inbox.

**Rate limiting**: reuses `@qnsc-vn/platform-cache`'s `CacheService
.consumeRateLimit` — already wired (real atomic sliding-window Lua script
on Valkey), not new infrastructure. 5 login attempts/15min per email, 3
forgot-password/hour per email, 10 signups/hour per IP. Not optional for
this audience — elderly, non-technical users are exactly who password-
guessing bots target hardest, and this repo doesn't get a second chance to
make a good first impression with a real pilot user locked out by a bot.

**Scope cut, stated explicitly**: no `switchWorkspace`/multi-tenant-switch
endpoint in this pass, even though `TenantMemberRole` already has
`successor`/`accountant_delegate` implying real multi-membership use cases
(a user with multiple tenant memberships just gets the first one found).
`IWorkspaceService`/`IAccessService`/`ISsoConnectionRepository` are all
confirmed `@Optional()` in the real `AuthService`'s constructor (verified
against the compiled `.js`'s `__param` decorators, not assumed) — none are
bound, so Nest injects `undefined` and the package's own code path for each
is simply never exercised. `EntraTokenVerifier` IS mandatory (not
`@Optional()`) even though this product never calls Entra — given inert
placeholder options since `ssoLogin`/`ssoLoginFromConnection` (the only
callers) are never invoked here.

**Minimal, auth-events-only start on the "undo + audit log" pre-pilot
gap** (explicitly NOT the general business audit log, which stays open):
`identity.auth_audit_log`, backing the package's mandatory `IAuditService`
port. `record()` never throws back to the caller, per that port's own
contract — a bad audit row can never break a real login/logout/reset.

Verified: typecheck clean, e2e 63/63 (57 pre-existing + 6 new — signup
creates tenant+user+owner-membership atomically and blocks login before
verification; duplicate email rejected; wrong password and a nonexistent
email both reject identically (no enumeration leak); Google login creates
a new tenant on first login and correctly reuses it on a second login with
the same `sub`; forgot/reset-password round-trip confirms every existing
session is revoked after reset; the `email_verify` token row carries the
tenant id set at signup). Full e2e sweep across all 3 services green
(backend-api 63/63, connector-hub 12/12, agent-orchestrator 35/35). Real
manual end-to-end smoke test against the live dev server: real signup →
read the real verification link from the log (no real inbox, same
placeholder-credential convention as everywhere else) → verify → real
session with `claims: {"role":"owner"}` → login → `GET /v1/auth/me` →
`POST /v1/auth/refresh` (real token rotation, confirmed a genuinely
different access/refresh pair came back) → `POST /v1/auth/logout` → old
access token confirmed denylisted (401) → confirmed real Postgres state
directly (`identity.users`, `identity.tenant_members`,
`identity.user_tenant_memberships`, `identity.auth_audit_log` all correct,
including the package's own real `auth.logout` audit event written through
`AuthAuditService`) → confirmed duplicate signup (409) and wrong password
(401) both rejected correctly.

## Notifications — transactional outbox (email + in-app), pluggable Resend/SES

Picked after the user asked, as solution-architect-lead, to survey how
sibling QNSC products (rally, opshub) handle notifications before building
SoloDesk's own — a research fork read both repos' actual compiled/source
code directly (not guessed).

**No shared `@qnsc-vn/notifications` package exists.** rally and opshub each
hand-roll notifications independently (diverged copies) — nothing to
`pnpm add`; only the *design* was worth reusing. Both use the
**transactional outbox pattern** (an outbox row inserted in the SAME DB
transaction as the triggering business event, a separate relay dispatches it
later) — confirmed against current (2026) industry guidance (AWS
Prescriptive Guidance, Cloudflight engineering) as still the correct answer
to the dual-write problem: enqueuing straight to a queue can silently lose a
notification if the process crashes between the DB commit and the enqueue
call, a real bad failure mode for a government compliance program (a missed
e-invoice-threshold notice is not a nice-to-have).

**A real cross-repo bug found and deliberately avoided**: rally enqueues its
email cascade in a post-commit, error-swallowed task — a dual write, since
the notification row is already committed with nothing left to retry if the
enqueue itself fails. opshub's fix — insert the outbox row in the SAME
transaction as the domain event — is the version built here:
`NotificationService.notify(tenantId, input, tx?)` always writes the in-app
`notifications` row, and (when `input.email` is present) the `email_outbox`
row, both via `withTenantTransactionOrReuse` so it composes into a caller's
existing transaction (e.g. `InvoiceService.issueInvoice`'s `tx`) exactly
like every other cross-aggregate write in this codebase.

**Scope, decided deliberately**: no Server-Sent Events, no Valkey pub/sub
"wake" channel, no per-user notification preferences. rally/opshub route
in-app delivery through SSE with a per-event access recheck — real
engineering solving rally's fine-grained per-project-ACL churn (a user's
visibility can change mid-session), which SoloDesk's tenant model doesn't
have (fixed role per tenant), built for a desktop-first, always-open
collaboration tool. For an elderly/non-technical, mobile, occasional-use
audience, a plain unread-count + list fetched on demand
(`GET /v1/notifications`, `GET /v1/notifications/unread-count`,
`POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all`) is
the right MVP shape — added later only if a genuine need for real-time
in-app delivery shows up. No fabricated Vietnamese tax filing-deadline
computation logic either — that's a separate, real, compliance-sensitive
feature this repo has already declined to fabricate before (e-invoice
providers); this feature ships the infrastructure plus two real triggers
already available: the existing signup/password-reset emails, retrofit onto
the new outbox instead of the old direct-send `EmailService`, and a
genuinely new one — notifying a tenant's `owner` member(s) the first time
their cumulative revenue crosses the e-invoice threshold
(`InvoiceService.issueInvoice`, exact one-time-crossing check:
`requiresEInvoice && cumulativeBefore < threshold`, not "requiresEInvoice is
true" in general — every subsequent invoice this year stays true too, but
re-notifying on each one would be spammy).

**A real RLS constraint found while implementing, not assumed in the
plan**: `notifications`/`email_outbox` are correctly RLS-scoped (real
business data, unlike real-login's global identity tables) — which means
`EmailOutboxRelayService`'s sweep can't run one global "SELECT ... FOR
UPDATE SKIP LOCKED" across every tenant's due rows without ambient tenant
context. Since `identity.tenants` itself is NOT RLS-scoped (it IS the
tenant list), the sweep iterates every tenant and opens its own small
`withTenantTransaction`-scoped batch (`LIMIT 5`) per tenant — a real,
deliberate trade-off for a pilot-scale program (dozens/hundreds of tenants,
not planet-scale SaaS), not a hack.

**A second, more subtle Postgres finding, caught by a test, not assumed**:
`current_setting('app.tenant_id', true)` returns the empty string `''`
(confirmed directly via `psql`: `BEGIN; SELECT set_config(...); COMMIT;
SELECT current_setting(...)` → `''`, `IS NULL` → `false`), NOT `NULL`, once
a pooled connection has PREVIOUSLY run any `SET LOCAL`-using transaction —
and `''::uuid` is a hard cast ERROR, not a graceful empty-result, unlike
what this repo's own RLS comments assume ("NULL is never true for any real
row" describes a connection that has NEVER run a scoped transaction, not a
reused one). No production code path is affected (everything already always
wraps RLS-table queries in `withTenantTransaction` first) — this only bit a
test helper (`extractTokenFromOutbox` in `test/auth.e2e-spec.ts`) that
queried `email_outbox` without a tenant-scoped wrapper. Fixed there; worth
knowing for any FUTURE test helper that queries an RLS table directly.

**Email providers**: `IEmailProvider` (`domain/ports/email-provider.port.ts`)
— `ResendEmailProvider` (the prior `EmailService`'s real `fetch`-based
Resend call, moved and generalized) and a new, real `SesEmailProvider`
(`@aws-sdk/client-sesv2`), selected by `EMAIL_PROVIDER=resend|ses` (default
`resend` — the right default for this stage/volume per current 2026
research: Resend wins on dev speed under ~500K emails/month, SES wins past
that or when AWS-native cost matters more). rally already has a working SES
provider, so this is a real, proven-elsewhere second option, not a guess —
not live-verified in this session (no real AWS credentials), same
disclaimer as every other not-live-verified 3rd-party integration here
(connector-hub's adapters, Google OAuth). `EmailDispatcher` is the ONE place
the "not configured → `Logger.warn` instead of throw" fallback lives,
provider-agnostic — same "let key, I will input later" pattern as
everywhere else in this repo, now working regardless of which provider is
selected.

**Relay worker**: `src/worker-notifications.ts`, same "separate process
from the HTTP app" shape as `worker-pdf.ts` (`ts-node`, not `tsx` — same
documented `emitDecoratorMetadata` reason), registers ONE BullMQ repeatable
job via `Queue.upsertJobScheduler` (BullMQ v6 moved repeatable scheduling
off `Queue.add`'s `JobsOptions` onto this dedicated API — found while
wiring it, not assumed) every 30s, whose processor calls
`EmailOutboxRelayService.processBatch()`. Backoff/dead-letter numbers (30s
doubling, capped 30min, dead-letter past 5 attempts) match rally's own
production-proven `AbstractOutboxRelay` — not reinvented.

Verified: typecheck clean, e2e 70/70 in backend-api (63 pre-existing + 7
new: `notify()` writes both rows atomically, in-app-only skips the outbox
row, duplicate `sourceEventId` is a no-op, unread-count/mark-read/mark-all-
read against real rows, `EmailOutboxRelayService.processBatch()` with a
stub `IEmailProvider` — success marks `sent`, forced failures bump
`attempts`/backoff and reach `dead_letter` at 5, plus a new case in
`invoice-tax.e2e-spec.ts` confirming exactly one notification + one queued
email on the crossing invoice and none on a third already-over-threshold
one). Full 3-service sweep: connector-hub 12/12 unaffected; agent-orchestrator
had 2 unrelated pre-existing failures in `get-sales-summary.e2e-spec.ts`,
confirmed via direct `psql` query and `git status` (zero uncommitted
changes there) to be a genuine, narrow time-window flake in that test's own
"seed orders N hours ago" design — it happened to run within ~2 hours of
the Vietnam-midnight boundary, nothing to do with this feature. Real manual
end-to-end smoke test against the live dev server + a real running
`worker-notifications` process: a real signup produced a real `pending`
`email_outbox` row, the relay's real 30s sweep picked it up and marked it
`sent` (confirmed via direct Postgres query, not assumed from logs alone),
and all 4 new `/v1/notifications*` endpoints round-tripped against a real
session (list → unread-count 1 → mark read → unread-count 0).

---

# `apps/web-accounting` — first authenticated frontend

Real login and notifications unblocked this: the first authenticated
frontend in this repo (`web-buyer-portal` is deliberately public). Picked
next, confirmed with the user from a short list (returns/exchanges, a
general business audit log, and `web-b2g-dashboard` were the alternatives).

**Audience correction made before designing anything, not assumed**: this
app is for the **shared accountant/support staff** (docs Section 8's own
app description), NOT the household-business owner — that's the separate,
out-of-scope-here Flutter mobile app (`apps/mobile`, "primary surface for
household users"). It's a professional dashboard tool for someone managing
multiple tenants' books; it should look and read like one, not inherit the
"elderly/non-technical, one big button" language the rest of this product's
design intentionally uses elsewhere.

**Design, `ui-ux-pro-max` first, per the standing instruction** — same
"verify fit, override the tool's wrong auto-aggregation" discipline as
`web-buyer-portal`'s own `MASTER.md` entry: the tool again suggested a
marketing landing pattern ("Enterprise Gateway" — hero video, mega menu,
"Contact Sales" CTA) + Dark Mode (OLED) + Fira Code, all wrong for the same
reasons already documented for buyer-portal. Wrote
`design-system/solodesk/pages/web-accounting.md` — the page-level override
`MASTER.md` explicitly anticipated and deferred ("Dashboard/data pages...
not covered by this first cut"). Kept Master's light Agriculture/Farm Tech
palette + Lexend/Source Sans 3 typography; adopted the `data-dense-
dashboard` style's real structural values (`--sidebar-width: 240px`,
`--header-height: 56px`, `--table-row-height: 36px`, 12-col grid,
sortable/sticky tables — confirmed `Light Mode: supported`, not forced into
the tool's dark-mode default).

**A real architecture decision, made while designing, not left implicit**:
`backend-api` has zero CORS configured (never needed it — `web-buyer-
portal` only ever fetches server-side). Rather than add CORS just to let
the browser call `backend-api` directly — which would also mean putting
`accessToken`/`refreshToken` somewhere client JS can read them, real XSS
exposure — this app is its own thin BFF: Server Actions call `backend-
api`'s real `/v1/auth/{login,google,refresh,logout}` and set the tokens as
`httpOnly` cookies on THIS app's own domain (`sd_at`/`sd_rt`/`sd_csrf`/
`sd_exp`/`sd_user`, all httpOnly — even the display-only `sd_user` never
reaches client JS; Server Components read it and pass it down as props).
Server Components/Actions read the cookie and call `backend-api` server-
side with a normal `Authorization: Bearer` header. No CORS anywhere.

**A real constraint found while implementing, not assumed in the plan**:
a Server Component render cannot set cookies at all (confirmed against
Next 16's own bundled docs — `cookies().set()` only works in a Server
Function/Route Handler/Proxy response) — so a reactive "401 → refresh →
retry" helper inside a page's data-fetch couldn't actually persist a
refreshed token pair; there'd be nowhere to put the `Set-Cookie` header.
Moved proactive refresh into `proxy.ts` instead (Next 16 renamed
`middleware.js` to `proxy.js` — confirmed against the bundled docs, not
assumed from training data, same discipline `web-buyer-portal`'s own
`AGENTS.md` already flags for this Next version): it runs on every
navigation, reads `sd_exp`, and if within 1 minute of expiry calls
`backend-api`'s real `/v1/auth/refresh` and sets fresh cookies on the
response before continuing — a genuinely correct place for this logic, not
a workaround. `lib/backend-api-client.ts`'s `authenticatedFetch` stays a
plain bearer-header fetch as a result, no retry logic needed there.

**Scope, deliberately narrow** (same "narrow but real, prove it end to
end" discipline as everywhere else this session): `/login` (password +
Google Sign-In) and `/` (dashboard shell + one real data screen — the
orders list, since `GET /v1/orders` already existed) + the notification
bell (pairs directly with the notifications feature just shipped).
Invoices/stock pages reuse the exact same `DashboardShell`/`DataTable`
components later — not built now. Interactive client-side table sorting is
also a documented cut (`DataTable` renders whatever order the caller's
data already comes back in) — real, but not needed to prove the shape.
`OrderResponseDto` gained a `createdAt` field (the domain type already had
it, just never surfaced) — a real UX gap for an orders table with no date
column, small and additive.

**A real bug found while writing the test suite, not assumed**: a "fresh
account has zero notifications" test failed — `signupWithPassword`
(backend-api) already files a real `EMAIL_VERIFY` notification for every
signup, so a freshly verified account starts at an unread count of 1, not
0. Fixed the test's own wrong assumption, not the (correct) backend
behavior.

Google Sign-In uses the real Google Identity Services SDK
(`accounts.google.com/gsi/client`), verified server-side by `backend-
api`'s real `GoogleTokenVerifier` — not live-verified end to end in this
session (`NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is a placeholder, same "let
key, I will input later" pattern as everywhere else; a real Google Cloud
Console OAuth client with `localhost:3010` as an authorized origin is
needed to actually click the button).

Verified: `next build` clean (real TypeScript check via Next's pipeline,
same as `web-buyer-portal`), ESLint clean, `pnpm test` 7/7 (real backend-
api, real Postgres, no mocks — `loginWithPassword` against a real signed-
up-and-verified account, wrong password and nonexistent email both
rejected; `getOrders` against a real seeded order and an empty-tenant
case; `getNotifications`/`getUnreadCount`/`markRead`/`markAllRead` against
real rows, including the just-described real signup-notification finding).
Real manual smoke test against the live dev stack (`backend-api` :3000 +
`worker-notifications` + this app on :3010) — no headless-browser tool
available in this session, said so explicitly rather than claiming a full
UI click-through, but verified everything reachable via real HTTP calls:
an unauthenticated request to `/` redirects to `/login` (proxy); `/login`
renders the real form; a session crafted from REAL tokens (obtained via
backend-api's actual signup → verify-email HTTP flow, same shape the
Server Action would produce) renders the full dashboard with a real
seeded order and the real signup notification, correct status pills,
correct unread count; an expired `sd_exp` cookie triggers the proxy's
real proactive refresh, confirmed by real NEW `Set-Cookie` headers
containing a genuinely rotated access/refresh/csrf token pair from a real
`backend-api` call.

## web-accounting extended — invoices + stock, reusing the same components

Picked as the next module, confirmed with the user, right after
`web-accounting` shipped with orders only. Extends the SAME
`DashboardShell`/`DataTable`/`StatusPill` components to two more real data
sources — no new architecture, the login/BFF/proxy work was already done.

**One small, real, justified backend addition**: the stock page needs SKU
catalog metadata + aggregated quantity in one view, but no endpoint gave
that — `GET /v1/lots/available/:skuId` only covers one SKU at a time,
which would mean N+1 calls to build a stock table (the exact anti-pattern
`OrderDrizzleRepository.listByTenant`'s own header comment already
documents avoiding). Added `ILotRepository.listAvailableQuantitiesByTenant`
(same aggregation as `getAvailableQuantity`, `GROUP BY sku_id`, one query
for the whole tenant) and `InventoryService.getStockSummary` (joins it
against `ISkuRepository.listByTenant` in-memory — `InventoryService`
gained a `SKU_REPOSITORY` injection alongside its existing
`LOT_REPOSITORY`), exposed as `GET /v1/lots/stock-summary`. A SKU with no
lots received yet still appears, zeroed out, not silently missing.

**A real operational finding, hit while running the test suite, not a code
bug**: `POST /v1/auth/signup`'s real rate limit (10/hour per IP, built
into the real-login feature) tripped repeatedly while iterating on
`web-accounting`'s test suite — each spec file was creating a fresh
account per `it()` (11 real signups in one run, several runs in a row).
`backend-api`'s OWN e2e tests never hit this because they construct
`SignupService` directly, bypassing the HTTP controller the limiter lives
on; `web-accounting`'s tests are the first in this repo to call the real
`/v1/auth/signup` endpoint over real HTTP repeatedly, so they're the
first to actually exercise this real production constraint. Fixed on the
TEST side, correctly, not by weakening the limiter: every spec file now
shares ONE real signup across all its `it()` blocks via `beforeAll,`
cutting a full test run from 11 signups to 5.

Verified: `next build` clean, ESLint clean, `pnpm test` 7/7 (5 real
signups total, real backend-api, real Postgres, no mocks), backend-api's
own e2e suite 72/72 (70 pre-existing + 2 new for
`getStockSummary`/`listAvailableQuantitiesByTenant`). Real manual smoke
test against the live dev stack: issued a real invoice via real HTTP
(SKU → lot → order → invoice, the full chain), seeded a real SKU + lot for
stock, then hit `/invoices` and `/stock` with a session crafted from real
tokens (same technique as the original `web-accounting` smoke test) and
confirmed both pages render the real invoice number/total/e-invoice pill
and the real SKU code/quantity/active-status pill; confirmed all 3
sidebar nav links (Đơn hàng/Hóa đơn/Kho hàng) render correctly.

## Returns — full-order reversal spanning order + invoice + payment + stock

Picked as the next module, confirmed with the user from a short list
(returns/exchanges, forgot-password, a general business audit log,
`web-b2g-dashboard`). Closes docs Section 11's one-line pre-pilot risk
item — *"Returns/exchanges linked back to the original order"* — which had
zero further detail in either doc (confirmed by grep: no "hoàn trả"/"đổi
trả"/"hoàn tiền" hits in the Vietnamese doc), so the scope below was
decided deliberately, not assumed from a spec.

**Scope, decided deliberately**: full-order returns only, no partial-line
returns (invoices have no line-item structure of their own to reverse
partially — one row per order with subtotal/tax/total, not per-line — a
partial return would need a whole new invoice-line modeling layer this
codebase doesn't have), and no separate "exchange" concept (a return
followed by a brand-new order for the replacement item achieves the same
real operational outcome; a formal linked-exchange record is a UX nicety
on top of two already-real primitives — YAGNI until a real need shows up).

**`sales.returns`** (new table, migration `0014_returns_schema.sql`):
`order_id`/`invoice_id` FKs, `reason` (free text — no closed taxonomy in
either doc), `refund_amount` (may be `0` — an invoiced-but-never-paid
order refunds nothing), `refund_method` (nullable, only meaningful when
`refund_amount > 0`), `status` (`'completed'` only — v1 has no
partial/pending return workflow, a return either fully completes in one
transaction or the whole thing rolls back).

**`payments.payments` gained a `type: 'payment' | 'refund'` column** — the
minimal real change needed to keep `PaymentService.getPaymentSummary`
accurate after a return. A refund is recorded as a normal-shaped payment
row with `type: 'refund'`; `sumByInvoice` nets refunds as negative
(`SUM(CASE WHEN type='refund' THEN -amount ELSE amount END)`) instead of
summing everything as a plain payment. This was the deliberate
alternative to putting `refundAmount` only on the `Return` row, which
would have left `paidAmount` still showing the ORIGINAL amount and
`isFullyPaid: true` on a returned/cancelled invoice — factually wrong,
since the customer got their money back and nothing is actually settled.
With the `type` column, a returned invoice's summary correctly shows
`paidAmount: '0.00'`, `outstandingAmount: <the original total>`,
`isFullyPaid: false` — the summary is honest that nothing is on record as
paid, not a false "fully paid." (Existing rows default to `'payment'`,
backward compatible.)

**Two pre-existing gaps closed alongside this feature, both real, both
found by reading the actual code, not assumed**:
- `PaymentService.recordPayment` had no positive-only validation
  (`@IsNumberString()` alone doesn't reject a leading `-`) — added an
  explicit `compareMoney(input.amount, '0') <= 0` rejection
  (`ConflictException('INVALID_AMOUNT', ...)`), exact-decimal money math,
  not a DTO regex fight.
- `OrderStatus`/`InvoiceStatus` both already declared a `'cancelled'`
  value, but neither `IOrderRepository` nor `IInvoiceRepository` had an
  `updateStatus` method — `'cancelled'` had been unreachable dead code
  until returns needed to actually set it. Both gained `updateStatus(id,
  tenantId, status, tx?)`, same optional-trailing-`tx` convention as every
  other mutating repository method in this codebase. `OrderStatus` also
  gained `'returned'`, distinct from `'cancelled'` (different real-world
  meaning: cancelled-before-fulfillment vs. returned-after-fulfillment).

**`ILotRepository.creditReturn`** — same "single statement + a
`stock_movements` insert in the same call" shape as `receive`, but
deliberately NOT the guarded `atomicUpdate` pattern every consuming
mutation uses: crediting stock back can never oversell, so no guard is
needed. Adds `'return'` to `StockMovementType`, a new precise label
rather than overloading the existing-but-still-unused `'adjustment'`.

**`ReturnService.returnOrder`** is the same repository-to-repository
composition shape as `OrderService.placeOrder`/`InvoiceService
.issueInvoice`: one `withTenantTransaction` + `withIdempotency` inside it,
injecting `ORDER_REPOSITORY`/`INVOICE_REPOSITORY`/`LOT_REPOSITORY`/
`PAYMENT_REPOSITORY` directly (not through their services) so every write
— stock credit per order line, the refund payment row, the order/invoice
status flips, the return record itself — shares one transaction. Order
must be `'confirmed'` (`ConflictException('ORDER_NOT_RETURNABLE', ...)`
otherwise) and must have a non-cancelled invoice
(`ConflictException('NO_INVOICE_TO_RETURN', ...)` otherwise). If the
invoice has a paid amount outstanding (net of any prior refund, via the
same `sumByInvoice`), `refundMethod` is required
(`ConflictException('REFUND_METHOD_REQUIRED', ...)` if omitted) — staff
must say how the money is physically going back.

**Newly required module exports** (previously only the *services* were
exported): `ORDER_REPOSITORY` from `SalesOrderModule`, `INVOICE_REPOSITORY`
from `InvoicingTaxModule`, `PAYMENT_REPOSITORY` from
`PaymentReconcileModule` — same reasoning as `CatalogInventoryModule`
already exporting `LOT_REPOSITORY`/`SKU_REPOSITORY` for `sales-order`'s
own cross-aggregate transaction.

Verified: typecheck clean across all 3 services (connector-hub/
agent-orchestrator untouched by this feature, confirmed clean rather than
assumed). `test/returns.e2e-spec.ts` (real Postgres, no mocks): a full
return on a paid invoice credits stock back to the exact quantity sold,
sets order `'returned'`/invoice `'cancelled'`, records a `type: 'refund'`
payment equal to what was paid, and confirms `getPaymentSummary` reflects
the honest post-return state described above (not a false
`isFullyPaid: true`); a return on an unpaid order refunds `0` and records
no refund row; a return owing money back but omitting `refundMethod` is
rejected; returning an already-returned order is rejected; returning an
order with no invoice yet is rejected; a same-key retry replays the
cached return without double-crediting stock (confirmed stock lands at
exactly the original quantity, not credited twice); a genuinely new
request (different key) on an already-returned order is still correctly
rejected. `payment-reconcile.e2e-spec.ts` extended for the new
negative/zero-amount rejection. Full backend-api e2e suite 80/80.

Real manual end-to-end smoke test against the live dev server, confirmed
via direct Postgres queries (not assumed from the API response alone):
placed a real order (2 units, lot stock 10→8), issued a real invoice,
recorded a real full cash payment, then called `POST /v1/returns` —
confirmed `catalog.lots.quantity_on_hand` back to `10.000`,
`sales.orders.status = 'returned'`, `tax.invoices.status = 'cancelled'`,
both a real `type: 'payment'` and a real `type: 'refund'` row in
`payments.payments` (same amount, same method), and a clean
`receipt → consumption → return` audit trail in
`catalog.stock_movements` for the lot.

## web-accounting — returns UI

Picked immediately after the backend feature, closing the "no frontend
yet" gap it was shipped with. Reuses the existing `DashboardShell`/
`DataTable`/`StatusPill` components verbatim — no new design-system
query needed for the read-only list, since it's the same shape as
`/invoices`/`/stock`. What IS new: this is the first genuinely
**interactive, mutating** page in `web-accounting` — every prior page
(`/`, `/invoices`, `/stock`) is a read-only list. Ran `ui-ux-pro-max`'s
`--domain ux` search for this specific gap (table row action + irreversible-
action confirmation + form submit feedback) rather than a full
`--design-system` re-run, since the visual system itself doesn't change —
only the interaction pattern is new.

**The create flow starts from an order, not a bare form.** A return is
reached via a new "Trả hàng" action link in the orders table (visible
only when `order.status === 'confirmed'`, matching backend's own
`ORDER_NOT_RETURNABLE` guard — no dead-end submit for an already-
returned/cancelled order), landing on `/returns/new?orderId=<id>`, which
fetches that ONE order (`lib/orders.ts` gained `getOrder`) and shows its
real context (date/customer/total/line count) before the staff member
commits — never a blind order-id text field. `ReturnForm` (the one new
Client Component, `useActionState` + a Server Action, same shape as
`LoginForm`) requires an explicit confirmation checkbox before submit —
the `ui-ux-pro-max` search's own "confirm before delete/irreversible
actions" guidance, applied here since a return is genuinely irreversible
(reverses stock/invoice/payment in one transaction). `refundMethod` is an
optional select, not required by the form itself — the backend is the
single source of truth for whether it's actually needed (`REFUND_METHOD_
REQUIRED`), surfaced as a specific inline error rather than guessed
client-side.

**`BackendApiError` gained a `code` field**, parsed from backend-api's
`{"error":{"code":...}}` envelope — the one small, real, additive change
to shared infra this page needed. Every prior page only ever checked
`.status`; this is the first Server Action that needs to distinguish
sibling 409s (`ORDER_NOT_RETURNABLE` vs `NO_INVOICE_TO_RETURN` vs
`REFUND_METHOD_REQUIRED`) to show the right Vietnamese message, not a
generic "something went wrong."

**Success feedback via a `?created=1` query param**, not a new flash-
message/cookie mechanism — the Server Action redirects to `/returns?
created=1` after a real success, and the list page renders a brief
`role="status"` banner when present. Matches the `ui-ux-pro-max` guidance
("confirm successful actions, never silent success") without adding
new session-state infrastructure for one banner.

Verified: `next build` clean, ESLint clean, `pnpm test` 9/9 (7
pre-existing + 2 new in `test/returns.spec.ts` — a fresh tenant's empty
returns list, then a real return created via `createReturn` against a
real seeded paid invoice; a return omitting `refundMethod` on a paid
invoice is rejected). Real manual smoke test against the live dev stack,
using two separately-seeded real sessions (one via `mint-dev-token`, one
via a full real signup → verify-email → login round-trip, since the
proxy's session check requires a real `sd_rt` refresh token a dev-minted
token doesn't have): confirmed the orders page renders the real "Trả
hàng" link only for the confirmed order; `/returns/new?orderId=...`
renders the real order's customer name and total; after seeding a real
return via the API, `/returns` shows it (reason, refund amount, refund
method pill, "Completed" status, success banner) and the now-`returned`
order's action link disappears; re-visiting `/returns/new` for that same
order correctly shows "already returned, cannot return" instead of the
form.

## Forgot/reset-password — a real cross-service env-var bug, found and fixed

Picked as the next module. Closes docs Section 11's "real login/session-
recovery" gap the rest of the way — backend-api's `POST /v1/auth/forgot-
password`/`POST /v1/auth/reset-password` were built with real login but
had no frontend anywhere; `LoginForm.tsx` had an explicit code comment
calling this out as a documented, deliberate cut.

**A real bug found by reading `signup.service.ts`, not assumed**: both
`verifyEmailUrl()` and `resetPasswordUrl()` read the SAME undeclared
`process.env.APP_PUBLIC_URL` (missing from `env.schema.ts`, `.env.example`,
and CI — violating this repo's own "every new env var goes in all three
places" rule), defaulting to `http://localhost:3000` — backend-api's OWN
port. That's correct for `verifyEmailUrl` (`/v1/auth/verify-email` really
is a backend-api route, clicked directly with no frontend page ever
rendering it), but wrong for `resetPasswordUrl`: `/reset-password` was
always meant to be a `web-accounting` frontend page, a different
deployable on a different port (:3010) entirely. Before this fix, a real
emailed password-reset link — in ANY environment, not just local dev —
pointed at a URL with no such route. Fixed by splitting into two env
vars: `APP_PUBLIC_URL` (kept, now properly declared, backend-api's own
public URL) and a new `WEB_ACCOUNTING_PUBLIC_URL` (defaults to
`http://localhost:3010` locally) — `resetPasswordUrl` switched to the
latter. Both added to `env.schema.ts` (with defaults, so this doesn't
become a newly-required var breaking existing deploys), `.env.example`,
and `backend-api-ci.yml`.

**The frontend pages themselves are a small, real addition** to
`web-accounting`, no new design-system query needed (same centered-card
shape as `/login`, `ui-ux-pro-max`'s buyer-portal/`web-accounting` MASTER
already covers this pattern): `/forgot-password` (email in, always the
same generic "if this email exists…" response out — no enumeration leak,
matching backend-api's own design) and `/reset-password?token=...` (new
password + confirm, submits to the real `POST /v1/auth/reset-password`,
redirects to `/login?reset=1` on success). `proxy.ts` gained both paths
as unauthenticated-allowed, alongside `/login`. `LoginForm.tsx`'s
"documented scope cut, no dead link here" comment is now simply a real
"Quên mật khẩu?" link — the cut is closed, not just narrated.

**A real rate-limit interaction worth naming**: `POST /v1/auth/forgot-
password` has its OWN limit (3/hour PER EMAIL, separate from login's
5/15min and signup's 10/hour/IP) — `lib/auth.ts`'s `forgotPassword()`
surfaces a real `429` as a distinguishable `rateLimited` boolean rather
than silently swallowing it into the same generic "check your email"
message every other outcome gets; a rate-limit response doesn't leak
whether the email exists, so distinguishing it is safe. The new
`test/forgot-reset-password.spec.ts` gives each `it()` its own fresh
email specifically to avoid tripping this real limit across the suite,
same discipline `auth.spec.ts`'s own header comment already documents for
signup's limit.

Verified: `next build` clean, ESLint clean, `pnpm test` 13/13 (9
pre-existing + 4 new — a real forgot-password → real token read from
`email_outbox` → real reset → old password now rejected, new password
works; an unknown email resolves identically, no leak; reusing an
already-used token is rejected; a garbage token is rejected), backend-api
typecheck clean and e2e 80/80 unaffected by the `env.schema.ts`/
`signup.service.ts` changes. Real manual end-to-end smoke test across
both live dev servers: real signup → verify → real `POST /forgot-
password` → confirmed the real `email_outbox` row's `resetUrl` now
correctly points at `localhost:3010` (not `:3000`, the bug just fixed) →
the real `/reset-password?token=...` page renders with the token embedded
→ submitted the real reset → old password correctly rejected (401),
new password correctly logs in (real session) → confirmed the reused
token correctly gets `401 INVALID_TOKEN` on a second attempt → confirmed
`/login?reset=1` renders the real success banner.

## `agent-orchestrator`'s missing onboarding-completion signal — found while designing the mobile app

Before any mobile code was written, designing its login-routing logic
("show the onboarding conversation vs. the home screen") surfaced a real
gap: `TenantService.activateTenant`/`ITenantRepository.activate` (sets
`identity.tenants.activated_at`) existed at every layer below the HTTP
boundary, but no controller route ever called it, and the onboarding
conversation's own final step ("confirm everything in one short summary")
was plain text with no tool call — `activatedAt` was permanently `null`
for every tenant, dead code since the day it was written.

Fixed with a new 4th onboarding tool, `complete_onboarding`
(agent-orchestrator), calling a new `POST /internal/onboarding/tenants/
:tenantId/complete` route (backend-api, same `@Public()`/
`@SkipTenantContext()`/`InternalServiceGuard` shape as the other 3
onboarding endpoints) — the onboarding system prompt's step 6 now
explicitly instructs the model to call it right after the summary, and
the mock-mode state machine (`runOnboardingTurnMocked`) calls it at its
final turn too, same "mock stands in for the LLM call only, real tool
functions underneath" discipline as every other mocked path in this repo.
`GET /v1/tenants/:id`'s `activatedAt` is now the one real signal any
client checks — first consumer: the new mobile app below.

Verified: typecheck clean (backend-api, agent-orchestrator), backend-api
e2e 81/81 (new: `TenantService.activateTenant` sets `activatedAt` on a
tenant that starts `null`), agent-orchestrator e2e 36/36 (new: the same
config-error-path convention `onboarding-tools.e2e-spec.ts` already uses
for its 3 siblings). Real manual smoke test against live dev servers (a
real Temporal dev server + a real mocked-LLM worker + backend-api): drove
a complete 5-turn onboarding conversation via real HTTP calls, confirmed
`identity.tenants.activated_at` flipped from `NULL` to a real timestamp,
and confirmed `GET /v1/tenants/:id` reflects it.

## `apps/mobile` — the first Flutter app, and the one most users will actually use

Picked immediately after backend-api's core business loop (onboarding →
catalog → sales → invoicing → payment → returns → traceability → booking
→ AI assistant) reached a genuinely usable state end to end. Docs' own
framing is explicit: this is "the primary surface for household users" —
`web-buyer-portal`/`web-accounting` are public-traceability and staff
tools respectively, neither is what an actual household-business owner
opens day to day.

**Scope, cut deliberately narrow, same discipline as every prior
feature**: login (password only — Google Sign-In is a documented cut,
same shape as the web apps' own not-yet-built items) → a real
`mode: 'onboarding'` AI conversation for a first-run tenant → a 4-tab
home shell (Trang chủ/Đơn hàng/Trợ lý AI/Thông báo) once onboarded.
Explicitly NOT built: docs' PowerSync offline-first sync (real, separate
infra — its own service, Postgres replica-identity setup, sync rules —
a big lift with no proven need yet) and Vietnamese voice input (a UI slot
is reserved in `ChatInput` for it, disabled, so adding it later doesn't
need a layout rework). Orders/invoices/stock table parity with
`web-accounting` is also NOT built — that's the accountant/staff
persona's tool; this app's Home tab shows 3 real numbers (today's
revenue, low-stock count, unread notifications), not a dense table.

**Design**: ran `ui-ux-pro-max --design-system` for this page
specifically (query tuned for the elderly/non-technical audience,
`--density 3 --variance 3 --motion 3`). Same "verify fit, override the
wrong auto-aggregation" discipline as every other page in this design
system — the tool suggested a marketing "Product Demo + Features"
pattern and a generic "AI purple" color scheme (`#7C3AED`), BOTH
overridden: this is a working app, not a landing page, and docs'
architecture explicitly wants `packages/ui-kit` sharing ONE design
system across Flutter and Next.js, not a second palette forked for
mobile. `design-system/solodesk/pages/mobile.md` documents the real
override reasoning and the parts of the tool's output that DID carry
over correctly (spacious/high-contrast structural values, the real
per-platform touch-target numbers — 48dp Android/44pt iOS, not a single
"44px" rule borrowed from the web pages).

**Architecture, genuinely different from the web apps' BFF shape, for a
real reason**: mobile apps aren't subject to browser CORS/XSS the way a
web app's client JS is, so this app calls backend-api/agent-orchestrator
directly with a bearer token stored in `flutter_secure_storage`
(Keychain/Keystore-backed) — no BFF, no httpOnly-cookie dance
`web-accounting` needed. `ApiClient` reacts to a real 401 by refreshing
once (concurrent 401s share one refresh call via a single in-flight
`Future`, guarding against backend-api's refresh-token rotation
invalidating itself mid-burst) — the mirror-image of `web-accounting`'s
proactive pre-expiry refresh in `proxy.ts` (that shape exists there
specifically because only a Proxy/Server Function response can set a
cookie; a plain in-memory token has no such constraint here). Riverpod +
go_router, picked directly from a `ui-ux-pro-max --stack flutter` query,
not guessed. `SessionController`'s `SessionStatus` (`unauthenticated` /
`needsOnboarding` / `ready`) is the one source of truth `app_router.dart`'s
redirect logic reads — the onboarding chat screen re-checks tenant status
after every reply and lets the router react on its own, rather than the
screen deciding when to navigate itself.

**A real Android toolchain bug, found only by actually building on a
device, not by reading the code**: `flutter_secure_storage@11.0.0`
requires compileSdk 37; this environment's Android SDK auto-installer
(no proper `cmdline-tools`/`sdkmanager` present) resolved that request
into a directory literally named `android-37.0` (`source.properties`
reports `AndroidVersion.ApiLevel=37.0`, an extension-level-qualified
string) while Gradle's target-hash resolution looked for the plain
`android-37` — a real, environment-specific mismatch, not a code bug.
Fixed by pinning `flutter_secure_storage: 9.2.4` (targets a normal, already-
available compileSdk), not by fighting the toolchain further.

Verified for real, not assumed: `flutter analyze` clean, `flutter test`
1/1 (a real widget test — `LoginScreen` renders its email/password fields
and login button). Backend-api and agent-orchestrator running live (the
same real dev stack the previous two features' smoke tests used, Android
emulator's `10.0.2.2` substituting for `localhost`), a real signup →
verify-email → login round-trip, then the ENTIRE onboarding conversation
driven via real `adb input`/screenshots on a booted Pixel 8 Pro emulator
(Android 14): every one of the 5 real turns rendered correctly (user
bubbles right-aligned/green-tinted, assistant bubbles left-aligned/
bordered, exactly per the design-system spec), and the moment the final
turn's real `complete_onboarding` call landed, the router — with ZERO
manual navigation code at the call site — redirected straight to the
home shell, confirming the reactive `SessionStatus` design actually
works, not just compiles. The home shell then rendered with the real
tenant name in the app bar and 3 real, correctly-computed numbers (today's
revenue `0 đ`, 1 low-stock SKU, 1 unread notification — the same "fresh
account starts at unread count 1" real signup notification `web-accounting`'s
own test suite already found); all 4 bottom-nav tabs (Home/Orders/
Assistant/Notifications) confirmed rendering their real empty
states/data correctly, including the Notifications tab's real
`EMAIL_VERIFY` row.
