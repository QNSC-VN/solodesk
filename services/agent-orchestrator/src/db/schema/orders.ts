import { pgSchema, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';

/**
 * READ-ONLY mirror of backend-api's `sales.orders` (see its
 * `src/db/schema/orders.ts`) — `solodesk_agent` has SELECT only, never
 * INSERT/UPDATE/DELETE (see migration 0001's header comment). Only the
 * columns Layer A tools actually query, not a full column-for-column copy.
 */
export const salesSchema = pgSchema('sales');

export const orders = salesSchema.table('orders', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  status: text('status').notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
