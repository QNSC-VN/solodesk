import { eq, and } from 'drizzle-orm';
import type { Db } from '../db/client';
import { idempotencyKeys } from '../db/schema/idempotency-keys';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `responseBody` is `jsonb` — round-tripping any domain object through it
 * turns every `Date` field into a plain ISO string (found while wiring
 * `InvoiceService.issueInvoice`'s idempotent retry: a cached replay's
 * `issuedAt` came back a string, not a `Date`, which would have silently
 * broken `invoice-pdf.service.ts`'s `issuedAt.toLocaleDateString()` the
 * moment a real client actually retried with the same key). Generic, not
 * invoice-specific — every idempotent operation's cached replay
 * (`placeOrder`'s `createdAt` included) gets this same treatment.
 */
function reviveDates<T>(value: T): T {
  if (typeof value === 'string') {
    return (ISO_DATE_RE.test(value) ? new Date(value) : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => reviveDates(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, reviveDates(v)])) as T;
  }
  return value;
}

/**
 * Mục 5.2 — every side-effecting operation gets an idempotency key, so an
 * agent/client retry (15–30% of the time, per docs Section 5.2) never
 * double-executes. `tx` MUST be the same transaction as the business logic
 * this wraps — the key-insert and the effect commit or roll back together,
 * so a failed attempt never "burns" the key for a legitimate retry.
 *
 * Two concurrent requests racing on the SAME key: Postgres's unique index
 * on `(tenant_id, idempotency_key)` blocks the second INSERT until the
 * first's transaction resolves — if it commits, the second's
 * `onConflictDoNothing` sees the conflict and this function returns the
 * first's already-committed cached response; if it rolls back, the second
 * proceeds normally. No explicit lock/retry loop needed.
 */
export async function withIdempotency<T>(tx: Db, tenantId: string, key: string, fn: () => Promise<T>): Promise<T> {
  const inserted = await tx
    .insert(idempotencyKeys)
    .values({ tenantId, idempotencyKey: key })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    const existing = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.idempotencyKey, key)))
      .limit(1);
    // Reachable only if the row exists but was never completed — cannot happen
    // given the invariant above (insert+update commit together); a real hit
    // here is a bug, not a normal race, so it fails loud rather than guessing.
    if (!existing[0] || existing[0].responseBody == null) {
      throw new Error(`Idempotency key "${key}" exists with no cached response — invariant violation, investigate.`);
    }
    return reviveDates(existing[0].responseBody as T);
  }

  const result = await fn();
  await tx.update(idempotencyKeys).set({ responseBody: result as object }).where(eq(idempotencyKeys.id, inserted[0]!.id));
  return result;
}
