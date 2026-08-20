import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { skus } from '../src/db/schema/skus';
import { withTenantTransaction, runWithTenant } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { OrderDrizzleRepository } from '../src/modules/sales-order/infrastructure/persistence/order.drizzle-repository';
import { OrderService } from '../src/modules/sales-order/application/order.service';
import { ResourceDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/resource.drizzle-repository';
import { BookingDrizzleRepository } from '../src/modules/booking-resource/infrastructure/persistence/booking.drizzle-repository';
import { ResourceService } from '../src/modules/booking-resource/application/resource.service';
import { BookingService } from '../src/modules/booking-resource/application/booking.service';
import { CustomerDrizzleRepository } from '../src/modules/customers/infrastructure/persistence/customer.drizzle-repository';
import { CustomerService } from '../src/modules/customers/application/customer.service';
import type { TenantIndustry } from '../src/modules/identity-tenant/domain/tenant.types';

/** Real Postgres, no mocks — no stored Customer entity, a real aggregate over sales.orders + booking.bookings. */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);

const resourceService = new ResourceService(new ResourceDrizzleRepository());
const bookingService = new BookingService(new BookingDrizzleRepository(), resourceService);

const customerService = new CustomerService(new CustomerDrizzleRepository());

let counter = 0;

async function seedTenant(legalName: string, industry: TenantIndustry = 'food_beverage'): Promise<string> {
  const [tenant] = await db.insert(tenants).values({ legalName, industry }).returning();
  return tenant!.id;
}

async function placeOrder(tenantId: string, customerName: string | undefined, channel: 'counter' | 'shopee', subtotal: string) {
  counter += 1;
  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx.insert(skus).values({ tenantId, skuCode: `SKU-CUST-${Date.now()}-${counter}`, name: 'Customer test item', unit: 'cai', unitPrice: subtotal }).returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-CUST-${Date.now()}-${counter}`, quantity: '1' });
  return runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `customer-test-key-${Date.now()}-${counter}`, {
      channel,
      ...(customerName !== undefined ? { customerName } : {}),
      lines: [{ skuId: sku.id, lotId: lot.id, quantity: '1', unitPrice: subtotal }],
    }),
  );
}

describe('Customer aggregate (real Postgres, no mocks — no stored Customer entity)', () => {
  it('aggregates order count, total spent, first/last date, and primary channel for a real customer name', async () => {
    const tenantId = await seedTenant('Customer Test — Aggregate');
    await placeOrder(tenantId, 'Chị Linh', 'counter', '100000.00');
    await placeOrder(tenantId, 'Chị Linh', 'counter', '250000.00');
    await placeOrder(tenantId, 'Chị Linh', 'shopee', '50000.00');

    const customers = await runWithTenant(tenantId, () => customerService.listCustomers(tenantId));
    const linh = customers.find((c) => c.name === 'Chị Linh');

    expect(linh).toBeDefined();
    expect(linh!.orderCount).toBe(3);
    expect(linh!.totalSpent).toBe('400000.00');
    expect(linh!.primaryChannel).toBe('counter'); // 2 counter vs 1 shopee
    expect(linh!.firstOrderAt).toBeInstanceOf(Date);
    expect(linh!.lastOrderAt).toBeInstanceOf(Date);
  });

  it('excludes orders with no customer name from the aggregate entirely', async () => {
    const tenantId = await seedTenant('Customer Test — No Name');
    await placeOrder(tenantId, undefined, 'counter', '999999.00');

    const customers = await runWithTenant(tenantId, () => customerService.listCustomers(tenantId));
    expect(customers).toHaveLength(0);
  });

  it('sorts customers by total spent descending, highest first', async () => {
    const tenantId = await seedTenant('Customer Test — Sort');
    await placeOrder(tenantId, 'Khách Nhỏ', 'counter', '10000.00');
    await placeOrder(tenantId, 'Khách Lớn', 'counter', '5000000.00');

    const customers = await runWithTenant(tenantId, () => customerService.listCustomers(tenantId));
    expect(customers[0]!.name).toBe('Khách Lớn');
  });

  it('a customer with a booking but no orders still appears, with orderCount 0', async () => {
    const tenantId = await seedTenant('Customer Test — Booking Only', 'tourism');
    const resource = await runWithTenant(tenantId, () => resourceService.createResource(tenantId, { name: 'Cano Customer Test', resourceType: 'room', capacity: 4 }));
    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Anh Minh', startsAt: new Date('2026-11-01T04:00:00Z'), endsAt: new Date('2026-11-01T06:00:00Z') }),
    );

    const customers = await runWithTenant(tenantId, () => customerService.listCustomers(tenantId));
    const minh = customers.find((c) => c.name === 'Anh Minh');
    expect(minh).toBeDefined();
    expect(minh!.orderCount).toBe(0);
    expect(minh!.bookingCount).toBe(1);
  });

  it('customer detail returns the real matching orders and bookings, exact-name-matched', async () => {
    const tenantId = await seedTenant('Customer Test — Detail', 'tourism');
    await placeOrder(tenantId, 'Cô Hương', 'counter', '150000.00');
    const resource = await runWithTenant(tenantId, () => resourceService.createResource(tenantId, { name: 'Room Customer Test', resourceType: 'room', capacity: 2 }));
    await runWithTenant(tenantId, () =>
      bookingService.requestHold(tenantId, { resourceId: resource.id, customerName: 'Cô Hương', startsAt: new Date('2026-11-02T04:00:00Z'), endsAt: new Date('2026-11-02T06:00:00Z') }),
    );

    const detail = await runWithTenant(tenantId, () => customerService.getCustomerDetail(tenantId, 'Cô Hương'));
    expect(detail.orders).toHaveLength(1);
    expect(detail.orders[0]!.totalAmount).toBe('150000.00');
    expect(detail.bookings).toHaveLength(1);
    expect(detail.bookings[0]!.resourceId).toBe(resource.id);

    // A different, never-seen name returns an honest empty detail, not an error.
    const empty = await runWithTenant(tenantId, () => customerService.getCustomerDetail(tenantId, 'Không Tồn Tại'));
    expect(empty.orderCount).toBe(0);
    expect(empty.orders).toHaveLength(0);
    expect(empty.bookings).toHaveLength(0);
  });

  it('a cancelled order never counts toward a customer\'s spend', async () => {
    const tenantId = await seedTenant('Customer Test — Cancelled Excluded');
    const order = await placeOrder(tenantId, 'Bà Tư', 'counter', '80000.00');
    await runWithTenant(tenantId, () => orderRepo.updateStatus(order.id, tenantId, 'cancelled'));

    const customers = await runWithTenant(tenantId, () => customerService.listCustomers(tenantId));
    expect(customers.find((c) => c.name === 'Bà Tư')).toBeUndefined();
  });
});
