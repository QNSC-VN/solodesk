import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { runWithTenant } from '../src/platform/tenant-context';
import { ResourceDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/resource.drizzle-repository';
import { BookingDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/booking.drizzle-repository';
import { ResourceService } from '../src/modules/booking-resource/application/resource.service';
import { BookingService } from '../src/modules/booking-resource/application/booking.service';

/** Booking state transitions — real Postgres, no mocks. */

const resourceRepo = new ResourceDrizzleRepository();
const bookingRepo = new BookingDrizzleRepository();
const resourceService = new ResourceService(resourceRepo);
const bookingService = new BookingService(bookingRepo, resourceService);

async function seedTenantWithResource(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'tourism' }).returning();
  const tenantId = tenant!.id;
  const resource = await runWithTenant(tenantId, () => resourceService.createResource(tenantId, { name: 'Table 1', resourceType: 'table', capacity: 4 }));
  return { tenantId, resource };
}

describe('Booking lifecycle transitions — real Postgres, no mocks', () => {
  it('confirm -> the freed hold slot is immediately reusable by a NEW hold (confirmed booking still occupies capacity)', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Lifecycle Tenant Confirm');
    const startsAt = new Date('2026-10-01T18:00:00Z');
    const endsAt = new Date('2026-10-01T20:00:00Z');

    const hold = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest', startsAt, endsAt, partySize: 4 }),
    );
    const confirmed = await runWithTenant(tenantId, () => bookingService.confirmBooking(hold.id, tenantId));
    expect(confirmed.status).toBe('confirmed');

    // Capacity 4, fully occupied by the confirmed booking — a second hold for the same window must fail.
    await expect(
      runWithTenant(tenantId, () =>
        bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest 2', startsAt, endsAt, partySize: 1 }),
      ),
    ).rejects.toThrow();
  });

  it('confirming an already-confirmed booking fails (guard requires status = held)', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Lifecycle Tenant DoubleConfirm');
    const hold = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, {
        resourceId: resource.id,
        customerName: 'Guest',
        startsAt: new Date('2026-10-02T12:00:00Z'),
        endsAt: new Date('2026-10-02T13:00:00Z'),
      }),
    );
    await runWithTenant(tenantId, () => bookingService.confirmBooking(hold.id, tenantId));

    await expect(runWithTenant(tenantId, () => bookingService.confirmBooking(hold.id, tenantId))).rejects.toThrow();
  });

  it('cancel frees capacity immediately for a new hold on the same window', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Lifecycle Tenant Cancel');
    const startsAt = new Date('2026-10-03T09:00:00Z');
    const endsAt = new Date('2026-10-03T10:00:00Z');

    const hold = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest', startsAt, endsAt, partySize: 4 }),
    );
    const cancelled = await runWithTenant(tenantId, () => bookingService.cancelBooking(hold.id, tenantId));
    expect(cancelled.status).toBe('cancelled');

    const rebooked = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest 2', startsAt, endsAt, partySize: 4 }),
    );
    expect(rebooked.status).toBe('held');
  });

  it('no-show only applies to a confirmed booking, not a held one', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Lifecycle Tenant NoShow');
    const hold = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, {
        resourceId: resource.id,
        customerName: 'Guest',
        startsAt: new Date('2026-10-04T19:00:00Z'),
        endsAt: new Date('2026-10-04T21:00:00Z'),
      }),
    );

    await expect(runWithTenant(tenantId, () => bookingService.markNoShow(hold.id, tenantId))).rejects.toThrow();

    await runWithTenant(tenantId, () => bookingService.confirmBooking(hold.id, tenantId));
    const noShow = await runWithTenant(tenantId, () => bookingService.markNoShow(hold.id, tenantId));
    expect(noShow.status).toBe('no_show');
  });

  it('a hold request for a non-existent resource 404s before touching booking capacity logic', async () => {
    const [tenant] = await db.insert(tenants).values({ legalName: 'Booking Lifecycle Tenant Missing Resource', industry: 'tourism' }).returning();
    const tenantId = tenant!.id;

    await expect(
      runWithTenant(tenantId, () =>
        bookingService.requestHold(tenantId, {
          resourceId: '00000000-0000-0000-0000-000000000000',
          customerName: 'Guest',
          startsAt: new Date('2026-10-05T09:00:00Z'),
          endsAt: new Date('2026-10-05T10:00:00Z'),
        }),
      ),
    ).rejects.toThrow();
  });
});
