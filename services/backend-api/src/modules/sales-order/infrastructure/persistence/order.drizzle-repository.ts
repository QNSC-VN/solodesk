import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { orders } from '../../../../db/schema/orders';
import { orderLines } from '../../../../db/schema/order-lines';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IOrderRepository, ResolvedOrderLine } from '../../domain/ports/order.repository';
import type { Order, CreateOrderInput } from '../../domain/order.types';

async function loadOrder(tx: Db, id: string, tenantId: string): Promise<Order | null> {
  const orderRows = await tx.select().from(orders).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId))).limit(1);
  const order = orderRows[0];
  if (!order) return null;

  const lineRows = await tx.select().from(orderLines).where(and(eq(orderLines.orderId, id), eq(orderLines.tenantId, tenantId)));
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

@Injectable()
export class OrderDrizzleRepository implements IOrderRepository {
  async findById(id: string, tenantId: string): Promise<Order | null> {
    return withTenantTransaction(db, tenantId, (tx) => loadOrder(tx, id, tenantId));
  }

  async listByTenant(tenantId: string): Promise<Order[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const orderRows = await tx.select().from(orders).where(eq(orders.tenantId, tenantId));
      const results: Order[] = [];
      for (const o of orderRows) {
        const full = await loadOrder(tx, o.id, tenantId);
        if (full) results.push(full);
      }
      return results;
    });
  }

  async create(
    tenantId: string,
    input: Pick<CreateOrderInput, 'channel' | 'customerName'>,
    lines: ResolvedOrderLine[],
    tx: Db,
  ): Promise<Order> {
    const totalAmount = lines.reduce((sum, l) => sum + Number(l.lineTotal), 0).toFixed(2);

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
}
