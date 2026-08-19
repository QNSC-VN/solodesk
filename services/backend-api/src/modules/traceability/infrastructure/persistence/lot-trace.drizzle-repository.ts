import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { lotTraces } from '../../../../db/schema/lot-traces';
import type { ILotTraceRepository } from '../../domain/ports/lot-trace.repository';
import type { LotTrace, PublishLotTraceInput } from '../../domain/trace.types';

function toDomain(row: typeof lotTraces.$inferSelect): LotTrace {
  return {
    lotId: row.lotId,
    tenantId: row.tenantId,
    skuName: row.skuName,
    skuCategory: row.skuCategory,
    lotCode: row.lotCode,
    sourceChannel: row.sourceChannel,
    supplierName: row.supplierName,
    receivedAt: row.receivedAt,
    publishedAt: row.publishedAt,
  };
}

/**
 * NOT wrapped in `withTenantTransaction` — `traceability.lot_traces` has no
 * RLS (see its schema file's header comment), so there is no tenant context
 * for Postgres to enforce here. Same "legitimately runs outside the tenant
 * transaction" shape as `TenantDrizzleRepository`.
 */
@Injectable()
export class LotTraceDrizzleRepository implements ILotTraceRepository {
  async findByLotId(lotId: string): Promise<LotTrace | null> {
    const rows = await db.select().from(lotTraces).where(eq(lotTraces.lotId, lotId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async upsert(tenantId: string, lotId: string, input: PublishLotTraceInput): Promise<LotTrace> {
    const rows = await db
      .insert(lotTraces)
      .values({
        lotId,
        tenantId,
        skuName: input.skuName,
        skuCategory: input.skuCategory,
        lotCode: input.lotCode,
        sourceChannel: input.sourceChannel,
        supplierName: input.supplierName,
        receivedAt: input.receivedAt,
      })
      .onConflictDoUpdate({
        target: lotTraces.lotId,
        set: {
          skuName: input.skuName,
          skuCategory: input.skuCategory,
          lotCode: input.lotCode,
          sourceChannel: input.sourceChannel,
          supplierName: input.supplierName,
          receivedAt: input.receivedAt,
          publishedAt: new Date(),
        },
      })
      .returning();
    return toDomain(rows[0]!);
  }
}
