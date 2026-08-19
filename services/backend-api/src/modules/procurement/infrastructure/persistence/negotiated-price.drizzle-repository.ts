import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, gt, or } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { negotiatedPrices } from '../../../../db/schema/negotiated-prices';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { INegotiatedPriceRepository } from '../../domain/ports/negotiated-price.repository';
import type { NegotiatedPrice } from '../../domain/procurement.types';

function toDomain(row: typeof negotiatedPrices.$inferSelect): NegotiatedPrice {
  return {
    id: row.id,
    supplierId: row.supplierId,
    skuId: row.skuId,
    unitCost: row.unitCost,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class NegotiatedPriceDrizzleRepository implements INegotiatedPriceRepository {
  async findActive(tenantId: string, supplierId: string, skuId: string, asOf: Date): Promise<NegotiatedPrice | null> {
    const asOfDate = toDateString(asOf);
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(negotiatedPrices)
        .where(
          and(
            eq(negotiatedPrices.tenantId, tenantId),
            eq(negotiatedPrices.supplierId, supplierId),
            eq(negotiatedPrices.skuId, skuId),
            lte(negotiatedPrices.effectiveFrom, asOfDate),
            or(isNull(negotiatedPrices.effectiveTo), gt(negotiatedPrices.effectiveTo, asOfDate)),
          ),
        )
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async setActive(tenantId: string, supplierId: string, skuId: string, unitCost: string, effectiveFrom: Date): Promise<NegotiatedPrice> {
    const effectiveFromDate = toDateString(effectiveFrom);
    return withTenantTransaction(db, tenantId, async (tx) => {
      // Close whatever was active — half-open interval, the new row's
      // effectiveFrom becomes the old row's exclusive end.
      await tx
        .update(negotiatedPrices)
        .set({ effectiveTo: effectiveFromDate })
        .where(
          and(
            eq(negotiatedPrices.tenantId, tenantId),
            eq(negotiatedPrices.supplierId, supplierId),
            eq(negotiatedPrices.skuId, skuId),
            isNull(negotiatedPrices.effectiveTo),
          ),
        );

      const rows = await tx
        .insert(negotiatedPrices)
        .values({ tenantId, supplierId, skuId, unitCost, effectiveFrom: effectiveFromDate })
        .returning();
      return toDomain(rows[0]!);
    });
  }
}
