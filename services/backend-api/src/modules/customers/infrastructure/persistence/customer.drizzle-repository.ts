import { Injectable } from '@nestjs/common';
import { eq, and, ne, isNotNull, desc, sql } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { orders } from '../../../../db/schema/orders';
import { bookings } from '../../../../db/schema/bookings';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { ICustomerRepository } from '../../domain/ports/customer.repository';
import type { CustomerSummary, CustomerOrderSummary, CustomerBookingSummary } from '../../domain/customer.types';

/** Confirmed real revenue only — same 'confirmed'-only convention `tax-filing`'s `RevenueDrizzleRepository` already established (a cancelled/returned order never became real business for this customer). */
const namedConfirmedOrder = (tenantId: string) => and(eq(orders.tenantId, tenantId), eq(orders.status, 'confirmed'), isNotNull(orders.customerName), ne(orders.customerName, ''));

@Injectable()
export class CustomerDrizzleRepository implements ICustomerRepository {
  async listSummaries(tenantId: string): Promise<CustomerSummary[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const totals = await tx
        .select({
          name: orders.customerName,
          orderCount: sql<string>`COUNT(*)`,
          totalSpent: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          firstOrderAt: sql<string>`MIN(${orders.createdAt})`,
          lastOrderAt: sql<string>`MAX(${orders.createdAt})`,
        })
        .from(orders)
        .where(namedConfirmedOrder(tenantId))
        .groupBy(orders.customerName);

      const byChannel = await tx
        .select({ name: orders.customerName, channel: orders.channel, count: sql<string>`COUNT(*)` })
        .from(orders)
        .where(namedConfirmedOrder(tenantId))
        .groupBy(orders.customerName, orders.channel);

      const bookingCounts = await tx
        .select({ name: bookings.customerName, count: sql<string>`COUNT(*)` })
        .from(bookings)
        .where(eq(bookings.tenantId, tenantId))
        .groupBy(bookings.customerName);

      // Primary channel = the channel with the most orders for that name;
      // ties broken alphabetically for a deterministic result.
      const primaryChannelByName = new Map<string, { channel: string; count: number }>();
      for (const row of byChannel) {
        const name = row.name!;
        const count = Number(row.count);
        const current = primaryChannelByName.get(name);
        if (!current || count > current.count || (count === current.count && row.channel < current.channel)) {
          primaryChannelByName.set(name, { channel: row.channel, count });
        }
      }

      const bookingCountByName = new Map<string, number>(bookingCounts.map((r) => [r.name, Number(r.count)]));

      // A customer might have bookings but no confirmed orders yet (or vice
      // versa) — union both name sets rather than just mapping `totals`.
      const names = new Set<string>([...totals.map((r) => r.name!), ...bookingCounts.map((r) => r.name)]);
      const totalsByName = new Map(totals.map((r) => [r.name!, r]));

      return [...names].map((name) => {
        const t = totalsByName.get(name);
        return {
          name,
          orderCount: t ? Number(t.orderCount) : 0,
          totalSpent: t?.totalSpent ?? '0.00',
          firstOrderAt: t ? new Date(t.firstOrderAt) : null,
          lastOrderAt: t ? new Date(t.lastOrderAt) : null,
          primaryChannel: primaryChannelByName.get(name)?.channel ?? null,
          bookingCount: bookingCountByName.get(name) ?? 0,
        };
      });
    });
  }

  async getOrders(tenantId: string, name: string): Promise<CustomerOrderSummary[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ id: orders.id, channel: orders.channel, status: orders.status, totalAmount: orders.totalAmount, createdAt: orders.createdAt })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.customerName, name)))
        .orderBy(desc(orders.createdAt));
      return rows;
    });
  }

  async getBookings(tenantId: string, name: string): Promise<CustomerBookingSummary[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ id: bookings.id, resourceId: bookings.resourceId, status: bookings.status, startsAt: bookings.startsAt, endsAt: bookings.endsAt, partySize: bookings.partySize })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.customerName, name)))
        .orderBy(desc(bookings.startsAt));
      return rows;
    });
  }
}
