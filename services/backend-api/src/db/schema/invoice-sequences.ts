import { uuid, integer } from 'drizzle-orm/pg-core';
import { taxSchema } from './tax-rules';
import { tenants } from './tenants';

/**
 * One row per tenant, atomically incremented via `INSERT ... ON CONFLICT
 * DO UPDATE ... RETURNING` (same "single guarded statement, Postgres row
 * lock serializes concurrent callers" pattern as `LotDrizzleRepository`'s
 * `atomicUpdate` — see `invoice.drizzle-repository.ts`). No separate
 * "does a row exist yet" check needed; the upsert handles both first-invoice
 * and Nth-invoice in one round trip.
 */
export const invoiceSequences = taxSchema.table('invoice_sequences', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id),
  nextNumber: integer('next_number').notNull().default(1),
});
