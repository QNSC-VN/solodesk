import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { runWithTenant } from '../src/platform/tenant-context';
import { ResourceDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/resource.drizzle-repository';
import { BookingDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/booking.drizzle-repository';
import { ResourceService } from '../src/modules/booking-resource/application/resource.service';
import { BookingService } from '../src/modules/booking-resource/application/booking.service';

/** Tenant-wide booking list (GET /v1/bookings's backing service) — real Postgres, no mocks. */

const resourceRepo = new ResourceDrizzleRepository();
const bookingRepo = new BookingDrizzleRepository();
const resourceService = new ResourceService(resourceRepo);
const bookingService = new BookingService(bookingRepo, resourceService);

async function seedTenant(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'tourism' }).returning();
  return tenant!.id;
}

async function seedResource(tenantId: string, name: string, capacity: number) {
  return runWithTenant(tenantId, () => resourceService.createResource(tenantId, { name, resourceType: 'room', capacity }));
}

describe('Tenant-wide booking list — real Postgres, no mocks', () => {
  it('lists bookings across two resources of one tenant in one call, ordered by startsAt descending', async () => {
    const tenantId = await seedTenant('Booking List Tenant All');
    const cano = await seedResource(tenantId, 'Cano 1', 8);
    const room = await seedResource(tenantId, 'Room A', 1);

    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: cano.id, customerName: 'Guest Early', startsAt: new Date('2026-10-01T04:00:00Z'), endsAt: new Date('2026-10-01T06:00:00Z') }),
    );
    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: room.id, customerName: 'Guest Late', startsAt: new Date('2026-10-02T13:00:00Z'), endsAt: new Date('2026-10-02T15:00:00Z') }),
    );

    const list = await runWithTenant(tenantId, () => bookingService.listBookings(tenantId));
    expect(list).toHaveLength(2);
    expect(list[0]!.customerName).toBe('Guest Late');
    expect(list[1]!.customerName).toBe('Guest Early');
    expect(new Set(list.map((b) => b.resourceId))).toEqual(new Set([cano.id, room.id]));
  });

  it('resourceId filter returns only that resource\'s bookings', async () => {
    const tenantId = await seedTenant('Booking List Tenant Resource Filter');
    const cano = await seedResource(tenantId, 'Cano 2', 8);
    const room = await seedResource(tenantId, 'Room B', 1);

    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: cano.id, customerName: 'Cano Guest', startsAt: new Date('2026-10-01T04:00:00Z'), endsAt: new Date('2026-10-01T06:00:00Z') }),
    );
    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: room.id, customerName: 'Room Guest', startsAt: new Date('2026-10-01T13:00:00Z'), endsAt: new Date('2026-10-01T15:00:00Z') }),
    );

    const list = await runWithTenant(tenantId, () => bookingService.listBookings(tenantId, { resourceId: cano.id }));
    expect(list).toHaveLength(1);
    expect(list[0]!.resourceId).toBe(cano.id);
    expect(list[0]!.customerName).toBe('Cano Guest');
  });

  it('from/to window filters on startsAt (inclusive bounds)', async () => {
    const tenantId = await seedTenant('Booking List Tenant Window');
    const cano = await seedResource(tenantId, 'Cano 3', 8);

    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: cano.id, customerName: 'Before', startsAt: new Date('2026-09-30T04:00:00Z'), endsAt: new Date('2026-09-30T06:00:00Z') }),
    );
    const inside = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: cano.id, customerName: 'Inside', startsAt: new Date('2026-10-01T04:00:00Z'), endsAt: new Date('2026-10-01T06:00:00Z') }),
    );
    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: cano.id, customerName: 'After', startsAt: new Date('2026-10-03T04:00:00Z'), endsAt: new Date('2026-10-03T06:00:00Z') }),
    );

    const list = await runWithTenant(tenantId, () =>
      bookingService.listBookings(tenantId, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-02T00:00:00Z') }),
    );
    expect(list.map((b) => b.id)).toEqual([inside.id]);
    expect(list).toHaveLength(1);
    expect(list[0]!.customerName).toBe('Inside');
  });

  it('a second tenant\'s bookings are absent from the first tenant\'s list (RLS scoping)', async () => {
    const tenantA = await seedTenant('Booking List Tenant Isolation A');
    const tenantB = await seedTenant('Booking List Tenant Isolation B');
    const resourceA = await seedResource(tenantA, 'Cano A', 8);
    const resourceB = await seedResource(tenantB, 'Cano B', 8);

    await runWithTenant(tenantA, () =>
      bookingService.requestHold(tenantA, { resourceId: resourceA.id, customerName: 'A Guest', startsAt: new Date('2026-10-01T04:00:00Z'), endsAt: new Date('2026-10-01T06:00:00Z') }),
    );
    await runWithTenant(tenantB, () =>
      bookingService.requestHold(tenantB, { resourceId: resourceB.id, customerName: 'B Guest', startsAt: new Date('2026-10-01T04:00:00Z'), endsAt: new Date('2026-10-01T06:00:00Z') }),
    );

    const listA = await runWithTenant(tenantA, () => bookingService.listBookings(tenantA));
    expect(listA).toHaveLength(1);
    expect(listA[0]!.customerName).toBe('A Guest');
  });

  it('a tenant with zero bookings gets an empty array, not an error', async () => {
    const tenantId = await seedTenant('Booking List Tenant Empty');
    const list = await runWithTenant(tenantId, () => bookingService.listBookings(tenantId));
    expect(list).toEqual([]);
  });

  it('to before from is rejected', async () => {
    const tenantId = await seedTenant('Booking List Tenant Bad Window');
    await expect(
      runWithTenant(tenantId, () =>
        bookingService.listBookings(tenantId, { from: new Date('2026-10-02T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') }),
      ),
    ).rejects.toThrow();
  });

  it('an unknown resourceId 404s (same guard as listByResource)', async () => {
    const tenantId = await seedTenant('Booking List Tenant Missing Resource');
    await expect(
      runWithTenant(tenantId, () => bookingService.listBookings(tenantId, { resourceId: '00000000-0000-0000-0000-000000000000' })),
    ).rejects.toThrow();
  });
});
