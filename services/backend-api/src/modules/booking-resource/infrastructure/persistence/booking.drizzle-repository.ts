import { Injectable } from '@nestjs/common';
import { eq, and, or, lt, gt, gte, lte, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { bookings } from '../../../../db/schema/bookings';
import { resources } from '../../../../db/schema/resources';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IBookingRepository } from '../../domain/ports/booking.repository';
import type { Booking, BookingListFilters, RequestHoldInput } from '../../domain/booking.types';

function toDomain(row: typeof bookings.$inferSelect): Booking {
  return {
    id: row.id,
    tenantId: row.tenantId,
    resourceId: row.resourceId,
    customerName: row.customerName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    partySize: row.partySize,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt,
  };
}

/**
 * "Active" for capacity purposes: confirmed, or held with a hold that
 * hasn't expired yet. An expired held row simply drops out of this
 * condition on its own — no cleanup job required (see bookings.ts's
 * header comment).
 */
function activeForCapacity(asOf: Date) {
  return or(eq(bookings.status, 'confirmed'), and(eq(bookings.status, 'held'), gt(bookings.holdExpiresAt, asOf)));
}

@Injectable()
export class BookingDrizzleRepository implements IBookingRepository {
  async findById(id: string, tenantId: string): Promise<Booking | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByResource(resourceId: string, tenantId: string): Promise<Booking[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(bookings).where(and(eq(bookings.resourceId, resourceId), eq(bookings.tenantId, tenantId)));
      return rows.map(toDomain);
    });
  }

  async listByTenant(tenantId: string, filters?: BookingListFilters): Promise<Booking[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            filters?.resourceId !== undefined ? eq(bookings.resourceId, filters.resourceId) : undefined,
            filters?.from !== undefined ? gte(bookings.startsAt, filters.from) : undefined,
            filters?.to !== undefined ? lte(bookings.startsAt, filters.to) : undefined,
          ),
        )
        .orderBy(desc(bookings.startsAt));
      return rows.map(toDomain);
    });
  }

  /**
   * Capacity-vs-overlapping-bookings is an AGGREGATE check across rows, not
   * a single row's balance — the guarded-`UPDATE` trick `LotDrizzleRepository`
   * uses doesn't apply (there's no single row to lock when the slot is
   * still empty). Instead: a Postgres advisory lock scoped to this
   * transaction, keyed by `resourceId`, serializes every hold attempt on the
   * SAME resource — the standard fix for calendar/booking-conflict races.
   * `pg_advisory_xact_lock` auto-releases on commit/rollback, no manual
   * unlock needed. Two concurrent requests for DIFFERENT resources never
   * block each other (different lock keys).
   */
  async requestHold(tenantId: string, input: RequestHoldInput): Promise<Booking | null> {
    const partySize = input.partySize ?? 1;
    const holdMinutes = input.holdMinutes ?? 15;

    return withTenantTransaction(db, tenantId, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.resourceId})::bigint)`);

      const resourceRows = await tx
        .select({ capacity: resources.capacity })
        .from(resources)
        .where(and(eq(resources.id, input.resourceId), eq(resources.tenantId, tenantId)))
        .limit(1);
      const capacity = resourceRows[0]?.capacity;
      if (capacity === undefined) return null;

      const now = new Date();
      const overlapRows = await tx
        .select({ used: sql<string>`COALESCE(SUM(${bookings.partySize}), 0)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.resourceId, input.resourceId),
            eq(bookings.tenantId, tenantId),
            activeForCapacity(now),
            lt(bookings.startsAt, input.endsAt),
            gt(bookings.endsAt, input.startsAt),
          ),
        );
      const used = Number(overlapRows[0]!.used);
      if (used + partySize > capacity) return null;

      const rows = await tx
        .insert(bookings)
        .values({
          tenantId,
          resourceId: input.resourceId,
          customerName: input.customerName,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          partySize,
          status: 'held',
          holdExpiresAt: new Date(now.getTime() + holdMinutes * 60_000),
        })
        .returning();
      return toDomain(rows[0]!);
    });
  }

  async confirm(id: string, tenantId: string): Promise<Booking | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(bookings)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(bookings.id, id), eq(bookings.tenantId, tenantId), eq(bookings.status, 'held'), gt(bookings.holdExpiresAt, new Date())))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async cancel(id: string, tenantId: string): Promise<Booking | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(bookings)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(bookings.id, id), eq(bookings.tenantId, tenantId), inArray(bookings.status, ['held', 'confirmed'])))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async markNoShow(id: string, tenantId: string): Promise<Booking | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(bookings)
        .set({ status: 'no_show', updatedAt: new Date() })
        .where(and(eq(bookings.id, id), eq(bookings.tenantId, tenantId), eq(bookings.status, 'confirmed')))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }
}
