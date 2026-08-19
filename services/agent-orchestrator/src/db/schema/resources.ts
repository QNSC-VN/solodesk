import { uuid, text } from 'drizzle-orm/pg-core';
import { bookingSchema } from './bookings';

/** READ-ONLY mirror of backend-api's `booking.resources` — see `orders.ts`'s header comment. */
export const resources = bookingSchema.table('resources', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
});
