import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { returns } from '../../../../db/schema/returns';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IReturnRepository, CreateReturnRecordInput } from '../../domain/ports/return.repository';
import type { Return } from '../../domain/return.types';

function toDomain(row: typeof returns.$inferSelect): Return {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orderId: row.orderId,
    invoiceId: row.invoiceId,
    reason: row.reason,
    refundAmount: row.refundAmount,
    refundMethod: row.refundMethod,
    status: row.status,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ReturnDrizzleRepository implements IReturnRepository {
  async findById(id: string, tenantId: string): Promise<Return | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(returns).where(and(eq(returns.id, id), eq(returns.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<Return[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(returns).where(eq(returns.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  /**
   * Takes `tx` explicitly, mandatory — no internal `withTenantTransaction`
   * of its own. `ReturnService.returnOrder` must run this in the SAME
   * transaction as the stock credit/status updates/refund payment it
   * represents — same mandatory-trailing-tx convention as
   * `InvoiceDrizzleRepository.create`.
   */
  async create(tenantId: string, input: CreateReturnRecordInput, tx: Db): Promise<Return> {
    const rows = await tx
      .insert(returns)
      .values({
        tenantId,
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        reason: input.reason,
        refundAmount: input.refundAmount,
        refundMethod: input.refundMethod ?? null,
      })
      .returning();
    return toDomain(rows[0]!);
  }
}
