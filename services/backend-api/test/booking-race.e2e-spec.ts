import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { runWithTenant } from '../src/platform/tenant-context';
import { ResourceDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/resource.drizzle-repository';
import { BookingDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/booking.drizzle-repository';
import { ResourceService } from '../src/modules/booking-resource/application/resource.service';
import { BookingService } from '../src/modules/booking-resource/application/booking.service';

/**
 * Booking-conflict race safety, real Postgres, no mocks — the aggregate
 * (sum-across-overlapping-rows) equivalent of `inventory-race.e2e-spec.ts`.
 * If `requestHold`'s `pg_advisory_xact_lock` is ever removed, concurrent
 * holds on a capacity-1 resource for the same window would both succeed —
 * this is what catches that regression.
 */

const resourceRepo = new ResourceDrizzleRepository();
const bookingRepo = new BookingDrizzleRepository();
const resourceService = new ResourceService(resourceRepo);
const bookingService = new BookingService(bookingRepo, resourceService);

async function seedTenantWithResource(legalName: string, capacity: number) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'tourism' }).returning();
  const tenantId = tenant!.id;
  const resource = await runWithTenant(tenantId, () =>
    resourceService.createResource(tenantId, { name: 'Homestay Room A', resourceType: 'room', capacity }),
  );
  return { tenantId, resource };
}

describe('Booking-conflict race safety — real concurrent requestHold on a shared window', () => {
  it('exactly one of two concurrent holds on a capacity-1 resource for the SAME window succeeds', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Race Tenant', 1);
    const startsAt = new Date('2026-09-01T14:00:00Z').toISOString();
    const endsAt = new Date('2026-09-01T16:00:00Z').toISOString();

    const attempt = (customerName: string) =>
      runWithTenant(tenantId, () =>
        bookingService.requestHold(tenantId, { resourceId: resource.id, customerName, startsAt: new Date(startsAt), endsAt: new Date(endsAt) }),
      );

    const results = await Promise.allSettled([attempt('Guest A'), attempt('Guest B')]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  it('20 concurrent holds against a capacity-10 tour: exactly 10 succeed, 10 see capacity unavailable', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Race Tenant Bulk', 10);
    const startsAt = new Date('2026-09-02T09:00:00Z').toISOString();
    const endsAt = new Date('2026-09-02T11:00:00Z').toISOString();

    const attempt = (i: number) =>
      runWithTenant(tenantId, () =>
        bookingService.requestHold(tenantId, {
          resourceId: resource.id,
          customerName: `Guest ${i}`,
          startsAt: new Date(startsAt),
          endsAt: new Date(endsAt),
        }),
      );

    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => attempt(i)));
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(10);
  });

  it('non-overlapping windows on the same capacity-1 resource never conflict', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Race Tenant Sequential', 1);

    const morning = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, {
        resourceId: resource.id,
        customerName: 'Guest Morning',
        startsAt: new Date('2026-09-03T08:00:00Z'),
        endsAt: new Date('2026-09-03T10:00:00Z'),
      }),
    );
    const afternoon = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, {
        resourceId: resource.id,
        customerName: 'Guest Afternoon',
        startsAt: new Date('2026-09-03T10:00:00Z'), // starts exactly when morning ends — no overlap
        endsAt: new Date('2026-09-03T12:00:00Z'),
      }),
    );

    expect(morning.status).toBe('held');
    expect(afternoon.status).toBe('held');
  });

  it('a hold that expires stops blocking capacity, without any cleanup job', async () => {
    const { tenantId, resource } = await seedTenantWithResource('Booking Race Tenant Expiry', 1);
    const startsAt = new Date('2026-09-04T14:00:00Z');
    const endsAt = new Date('2026-09-04T16:00:00Z');

    const firstHold = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest Expiring', startsAt, endsAt, holdMinutes: 1 }),
    );
    expect(firstHold.status).toBe('held');

    // Second attempt for the SAME window immediately still conflicts (hold not expired yet).
    await expect(
      runWithTenant(tenantId, () => bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest Immediate', startsAt, endsAt })),
    ).rejects.toThrow();

    // Manually age the hold into the past to simulate expiry without a real sleep.
    await runWithTenant(tenantId, async () => {
      const { db: rawDb } = await import('../src/db/client');
      const { bookings } = await import('../src/db/schema/bookings');
      const { withTenantTransaction } = await import('../src/platform/tenant-context');
      const { eq } = await import('drizzle-orm');
      await withTenantTransaction(rawDb, tenantId, (tx) => tx.update(bookings).set({ holdExpiresAt: new Date(Date.now() - 60_000) }).where(eq(bookings.id, firstHold.id)));
    });

    const secondHold = await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Guest After Expiry', startsAt, endsAt }),
    );
    expect(secondHold.status).toBe('held');
  });
});
