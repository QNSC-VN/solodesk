import { pgSchema, uuid, text, integer, boolean, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

/** Mục 2's "Booking & Resource" — a bookable thing (room, table, tour seat block, equipment). */
export const bookingSchema = pgSchema('booking');

export const resources = bookingSchema.table(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    resourceType: text('resource_type').notNull(), // 'room' | 'table' | 'tour_seat' | 'equipment' | ...
    // How much concurrent partySize this resource can hold in any overlapping
    // time window — 1 for a single room, N for a table/tour with N seats.
    capacity: integer('capacity').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    capacityPositive: check('resources_capacity_positive', sql`${t.capacity} > 0`),
  }),
);
