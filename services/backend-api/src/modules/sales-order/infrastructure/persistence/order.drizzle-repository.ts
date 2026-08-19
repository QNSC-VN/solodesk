import { Injectable } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { orders } from '../../../../db/schema/orders';
import { orderLines } from '../../../../db/schema/order-lines';
import { withTenantTransaction, withTenantTransactionOrReuse } from '../../../../platform/tenant-context';
import { sumMoney } from '../../../../platform/money';
import type { IOrderRepository, ResolvedOrderLine } from '../../domain/ports/order.repository';
import type { Order, CreateOrderInput, OrderStatus } from '../../domain/order.types';

function toOrder(order: typeof orders.$inferSelect, lineRows: (typeof orderLines.$inferSelect)[]): Order {
  return {
    id: order.id,
    tenantId: order.tenantId,
    channel: order.channel,
    status: order.status,
    customerName: order.customerName,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    lines: lineRows.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      lotId: l.lotId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}

async function loadOrder(tx: Db, id: string, tenantId: string): Promise<Order | null> {
  const orderRows = await tx.select().from(orders).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId))).limit(1);
  const order = orderRows[0];
  if (!order) return null;

  const lineRows = await tx.select().from(orderLines).where(and(eq(orderLines.orderId, id), eq(orderLines.tenantId, tenantId)));
  return toOrder(order, lineRows);
}

@Injectable()
export class OrderDrizzleRepository implements IOrderRepository {
  async findById(id: string, tenantId: string): Promise<Order | null> {
    return withTenantTransaction(db, tenantId, (tx) => loadOrder(tx, id, tenantId));
  }

  async listByTenant(tenantId: string): Promise<Order[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const orderRows = await tx.select().from(orders).where(eq(orders.tenantId, tenantId));
      if (orderRows.length === 0) return [];

      // Batched, not one loadOrder() call per row — that re-fetched the
      // header row it already had plus one lines query each, 1 + 2N queries
      // for N orders instead of 2 total.
      const orderIds = orderRows.map((o) => o.id);
      const lineRows = await tx.select().from(orderLines).where(and(inArray(orderLines.orderId, orderIds), eq(orderLines.tenantId, tenantId)));
      const linesByOrderId = new Map<string, (typeof orderLines.$inferSelect)[]>();
      for (const l of lineRows) {
        const existing = linesByOrderId.get(l.orderId);
        if (existing) existing.push(l);
        else linesByOrderId.set(l.orderId, [l]);
      }
      return orderRows.map((o) => toOrder(o, linesByOrderId.get(o.id) ?? []));
    });
  }

  async create(
    tenantId: string,
    input: Pick<CreateOrderInput, 'channel' | 'customerName'>,
    lines: ResolvedOrderLine[],
    tx: Db,
  ): Promise<Order> {
    const totalAmount = sumMoney(lines.map((l) => l.lineTotal));

    const orderRows = await tx
      .insert(orders)
      .values({
        tenantId,
        channel: input.channel,
        customerName: input.customerName ?? null,
        totalAmount,
      })
      .returning();
    const order = orderRows[0]!;

    await tx.insert(orderLines).values(
      lines.map((l) => ({
        tenantId,
        orderId: order.id,
        skuId: l.skuId,
        lotId: l.lotId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
    );

    const full = await loadOrder(tx, order.id, tenantId);
    return full!;
  }

  async updateStatus(id: string, tenantId: string, status: OrderStatus, outerTx?: Db): Promise<void> {
    return withTenantTransactionOrReuse(db, tenantId, outerTx, async (tx) => {
      await tx.update(orders).set({ status }).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
    });
  }
}
