import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { getUpcomingBookings } from '../src/temporal/activities/tools/get-upcoming-bookings.tool';

/** Real Postgres, no mocks — fixtures seeded via the admin connection, same reasoning as the other tool e2e specs. */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

async function seedTenant(legalName: string): Promise<string> {
  const rows = await adminSql`INSERT INTO identity.tenants (legal_name, industry) VALUES (${legalName}, 'tourism') RETURNING id`;
  return rows[0]!.id as string;
}

async function seedResource(tenantId: string, name: string, capacity = 4): Promise<string> {
  const rows = await adminSql`
    INSERT INTO booking.resources (tenant_id, name, resource_type, capacity)
    VALUES (${tenantId}, ${name}, 'table', ${capacity})
    RETURNING id
  `;
  return rows[0]!.id as string;
}

async function seedBooking(tenantId: string, resourceId: string, customerName: string, startsAt: Date, status = 'confirmed', partySize = 2): Promise<void> {
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  await adminSql`
    INSERT INTO booking.bookings (tenant_id, resource_id, customer_name, starts_at, ends_at, party_size, status)
    VALUES (${tenantId}, ${resourceId}, ${customerName}, ${startsAt.toISOString()}, ${endsAt.toISOString()}, ${partySize}, ${status})
  `;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describe('getUpcomingBookings tool — real Postgres, no mocks', () => {
  it('lists only CONFIRMED future bookings, soonest first, excluding held and past ones', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Bookings');
    const resourceId = await seedResource(tenantId, 'Ban so 1');

    await seedBooking(tenantId, resourceId, 'Khach som', hoursFromNow(2));
    await seedBooking(tenantId, resourceId, 'Khach muon', hoursFromNow(48));
    await seedBooking(tenantId, resourceId, 'Khach chua xac nhan', hoursFromNow(1), 'held'); // held — excluded
    await seedBooking(tenantId, resourceId, 'Khach qua khu', hoursFromNow(-24), 'confirmed'); // past — excluded

    const result = await getUpcomingBookings({ tenantId });

    expect(result.count).toBe(2);
    expect(result.bookings.map((b) => b.customerName)).toEqual(['Khach som', 'Khach muon']); // soonest first
    expect(result.bookings[0]!.resourceName).toBe('Ban so 1');
  });

  it('a tenant with no upcoming bookings gets an empty list, not an error', async () => {
    const tenantId = await seedTenant('Agent Test Tenant No Bookings');

    const result = await getUpcomingBookings({ tenantId });

    expect(result.count).toBe(0);
    expect(result.bookings).toEqual([]);
  });

  it('never returns more than the cap, even with many upcoming bookings', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Many Bookings');
    const resourceId = await seedResource(tenantId, 'Ban lon', 20);
    for (let i = 0; i < 25; i += 1) {
      await seedBooking(tenantId, resourceId, `Khach ${i}`, hoursFromNow(1 + i));
    }

    const result = await getUpcomingBookings({ tenantId });

    expect(result.count).toBeLessThanOrEqual(20);
  });
});
