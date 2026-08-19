import { eq, and, gte, asc } from 'drizzle-orm';
import { db } from '../../../db/client';
import { bookings } from '../../../db/schema/bookings';
import { resources } from '../../../db/schema/resources';
import { withTenantTransaction } from '../../../platform/tenant-db';

export interface GetUpcomingBookingsInput {
  tenantId: string;
}

export interface UpcomingBooking {
  resourceName: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  partySize: number;
}

export interface GetUpcomingBookingsResult {
  bookings: UpcomingBooking[];
  count: number;
}

export const GET_UPCOMING_BOOKINGS_TOOL_NAME = 'get_upcoming_bookings';

// Same explicit-cap discipline as get_outstanding_invoices — never an
// unbounded result set fed back into the model's context.
const MAX_RESULTS = 20;

export const getUpcomingBookingsToolSchema = {
  name: GET_UPCOMING_BOOKINGS_TOOL_NAME,
  description: `List the caller's own tenant CONFIRMED bookings starting from now onward, soonest first, capped at ${MAX_RESULTS}. Read-only, no arguments. (Chân dung 2 / tourism tenants: table/room reservations.)`,
  input_schema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
};

/**
 * Fourth Layer A tool, fourth schema grant (`booking.*`, see migration
 * 0004) — extends real Layer A coverage from the sales/catalog/tax
 * personas to Chân dung 2 (tourism/booking) tenants. `held` (unconfirmed)
 * bookings are deliberately excluded — a tentative hold isn't a
 * commitment worth surfacing to "what's coming up," same distinction
 * backend-api's own booking-resource module draws between `held` and
 * `confirmed`.
 */
export async function getUpcomingBookings(input: GetUpcomingBookingsInput): Promise<GetUpcomingBookingsResult> {
  return withTenantTransaction(db, input.tenantId, async (tx) => {
    const rows = await tx
      .select({
        resourceName: resources.name,
        customerName: bookings.customerName,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        partySize: bookings.partySize,
      })
      .from(bookings)
      .innerJoin(resources, eq(bookings.resourceId, resources.id))
      .where(and(eq(bookings.tenantId, input.tenantId), eq(bookings.status, 'confirmed'), gte(bookings.startsAt, new Date())))
      .orderBy(asc(bookings.startsAt))
      .limit(MAX_RESULTS);

    const results: UpcomingBooking[] = rows.map((r) => ({
      resourceName: r.resourceName,
      customerName: r.customerName,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      partySize: r.partySize,
    }));

    return { bookings: results, count: results.length };
  });
}
