import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { PermissionDeniedException } from '@qnsc-vn/platform-http';

/**
 * Section 4.1 / Mục 4.1 — the ONLY real tenant-isolation boundary is
 * RLS + per-transaction `SET LOCAL app.tenant_id`. Everything else (workflow
 * IDs, this ALS store) is routing/observability convenience, never the
 * security control. Read docs/ARCHITECTURE.md Section 4 before changing this file.
 */

interface TenantContext {
  tenantId: string;
}

const als = new AsyncLocalStorage<TenantContext>();

/** Fails CLOSED: no context set is a bug, not "unrestricted". Never return null/undefined here. */
export function getCurrentTenantId(): string {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error('getCurrentTenantId() called with no tenant context set — this is a bug, not a missing-tenant case. Every request path must call runWithTenant() first.');
  }
  return ctx.tenantId;
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return als.run({ tenantId }, fn);
}

/**
 * Runs `fn` inside a Postgres transaction with `app.tenant_id` set via
 * `SET LOCAL` — scoped to THIS transaction only, cleared automatically on
 * commit/rollback. Never use session-level `SET`: with transaction-mode
 * connection pooling the connection is reused across different tenants
 * between requests, and a session-level value would leak into the next one.
 *
 * `tenantId` is an explicit parameter, not read from ALS internally — callers
 * decide whether it comes from `getCurrentTenantId()` (the common case) or
 * from a second, independently-verified source (Section 4.4's defense-in-depth
 * assert at tool-call entrypoints compares the two before this is ever called).
 */
export async function withTenantTransaction<TSchema extends Record<string, unknown>, T>(
  db: PostgresJsDatabase<TSchema>,
  tenantId: string,
  fn: (tx: PostgresJsDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${sql.raw(`'${tenantId}'`)}`);
    return fn(tx);
  });
}

/**
 * Same as `withTenantTransaction`, but reuses an already-open `tx` if the
 * caller provides one — the composability primitive that lets an
 * application-service span writes across multiple repositories in ONE
 * transaction (e.g. `sales-order` placing an order and consuming stock
 * together, so a stock-consume failure can never leave an order recorded
 * with nothing deducted). Convention: every repository method that mutates
 * data takes an optional `tx` last parameter and calls this instead of
 * `withTenantTransaction` directly — same shape as rally's `Tx`-generic
 * repository ports (see docs Section 17.2).
 *
 * Deliberately does NOT re-run `SET LOCAL` when reusing a provided `tx` —
 * it's already set by whichever call opened that transaction, and Postgres
 * would reject a second `SET LOCAL` mid-transaction for the same setting
 * anyway only if scoped oddly; simpler to just not repeat it.
 */
export async function withTenantTransactionOrReuse<TSchema extends Record<string, unknown>, T>(
  db: PostgresJsDatabase<TSchema>,
  tenantId: string,
  tx: PostgresJsDatabase<TSchema> | undefined,
  fn: (tx: PostgresJsDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  if (tx) return fn(tx);
  return withTenantTransaction(db, tenantId, fn);
}

/**
 * Section 4.4 defense-in-depth: call at every tool/repository-method entrypoint
 * that receives an explicit tenantId argument from an external caller (e.g. an
 * MCP tool invocation). Rejects BEFORE touching the database if it doesn't
 * match the session's own tenant context — this catches a routing bug sending
 * a request to the wrong session, which RLS cannot catch since it happens
 * before the query reaches the database.
 */
export function assertTenantMatchesSession(callerTenantId: string): void {
  const sessionTenantId = getCurrentTenantId();
  if (callerTenantId !== sessionTenantId) {
    // Mục 20.2: errors flow through @qnsc-vn/platform-http's taxonomy
    // everywhere — a plain `Error` here was caught by no filter and rendered
    // as an opaque 500, not the 403 this actually is. Found by hitting the
    // real route with a real cross-tenant token, not by reading the code.
    throw new PermissionDeniedException(
      'TENANT_MISMATCH',
      `Tenant mismatch: caller passed tenantId=${callerTenantId} but session context is tenantId=${sessionTenantId}. Refusing before touching the database.`,
    );
  }
}
