import { Injectable } from '@nestjs/common';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { orders } from '../../../../db/schema/orders';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IRevenueRepository } from '../../domain/ports/revenue.repository';

@Injectable()
export class RevenueDrizzleRepository implements IRevenueRepository {
  async sumConfirmedRevenue(tenantId: string, from: Date, to: Date): Promise<string> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)` })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.status, 'confirmed'), gte(orders.createdAt, from), lt(orders.createdAt, to)));
      return rows[0]!.total;
    });
  }
}
