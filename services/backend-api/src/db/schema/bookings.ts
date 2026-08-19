import { uuid, text, integer, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bookingSchema, resources } from './resources';
import { tenants } from './tenants';

export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'no_show' | 'completed';

/**
 * `holdExpiresAt` is only meaningful while `status = 'held'`. An expired,
 * never-confirmed hold is never swept by a background job — it just stops
 * counting toward capacity once `hold_expires_at` passes (see the overlap
 * query in `booking.drizzle-repository.ts`), which is enough for
 * correctness. A cleanup job for tidiness/reporting is a real but separate
 * concern, out of scope here (YAGNI).
 */
export const bookings = bookingSchema.table(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    resourceId: uuid('resource_id').notNull().references(() => resources.id),
    customerName: text('customer_name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    partySize: integer('party_size').notNull().default(1),
    status: text('status').$type<BookingStatus>().notNull().default('held'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    endsAfterStarts: check('bookings_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
    partySizePositive: check('bookings_party_size_positive', sql`${t.partySize} > 0`),
  }),
);
