import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { PermissionDeniedException } from '@qnsc-vn/platform-http';

/**
 * Same mechanism as backend-api's `tenant-context.ts` — RLS + per-transaction
 * `SET LOCAL app.tenant_id` is the ONLY real tenant-isolation boundary here
 * too. Copied, not shared via an internal package (Section 20.6 YAGNI).
 */

interface TenantContext {
  tenantId: string;
}

const als = new AsyncLocalStorage<TenantContext>();

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

export async function withTenantTransactionOrReuse<TSchema extends Record<string, unknown>, T>(
  db: PostgresJsDatabase<TSchema>,
  tenantId: string,
  tx: PostgresJsDatabase<TSchema> | undefined,
  fn: (tx: PostgresJsDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  if (tx) return fn(tx);
  return withTenantTransaction(db, tenantId, fn);
}

export function assertTenantMatchesSession(callerTenantId: string): void {
  const sessionTenantId = getCurrentTenantId();
  if (callerTenantId !== sessionTenantId) {
    throw new PermissionDeniedException(
      'TENANT_MISMATCH',
      `Tenant mismatch: caller passed tenantId=${callerTenantId} but session context is tenantId=${sessionTenantId}. Refusing before touching the database.`,
    );
  }
}
