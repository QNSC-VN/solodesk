import { uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

/** READ-ONLY mirror of backend-api's `booking.bookings` — see `orders.ts`'s header comment. */
export const bookingSchema = pgSchema('booking');

export const bookings = bookingSchema.table('bookings', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  resourceId: uuid('resource_id').notNull(),
  customerName: text('customer_name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  partySize: integer('party_size').notNull(),
  status: text('status').notNull(),
});
