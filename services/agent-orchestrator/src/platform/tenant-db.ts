import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

/**
 * Same RLS + `SET LOCAL app.tenant_id` mechanism as backend-api/connector-hub
 * — deliberately WITHOUT their AsyncLocalStorage/`runWithTenant()` layer.
 * Activities run in the Temporal WORKER process, invoked directly by
 * Temporal with explicit arguments (never through an HTTP request
 * lifecycle) — there is no ambient per-request context to bridge into here,
 * and Temporal's own determinism/replay model favors explicit arguments
 * over hidden ambient state anyway. Every tool function takes `tenantId`
 * as a plain parameter, always, and passes it here directly.
 */
export async function withTenantTransaction<TSchema extends Record<string, unknown>, T>(
  db: PostgresJsDatabase<TSchema>,
  tenantId: string,
  fn: (tx: PostgresJsDatabase<TSchema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Parameterized, not string-interpolated raw SQL — `SET LOCAL` doesn't
    // accept a bind parameter directly, but `set_config` does.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
