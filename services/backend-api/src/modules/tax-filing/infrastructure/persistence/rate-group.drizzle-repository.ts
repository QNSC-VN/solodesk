import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { rateGroups } from '../../../../db/schema/rate-groups';
import type { IRateGroupRepository } from '../../domain/ports/rate-group.repository';
import type { TaxRateGroup, RateGroupCode } from '../../domain/tax-filing.types';

function toDomain(row: typeof rateGroups.$inferSelect): TaxRateGroup {
  return {
    code: row.code,
    name: row.name,
    gtgtRate: row.gtgtRate,
    tncnRate: row.tncnRate,
    isDraft: row.isDraft,
  };
}

@Injectable()
export class RateGroupDrizzleRepository implements IRateGroupRepository {
  async findByCode(code: RateGroupCode): Promise<TaxRateGroup | null> {
    const rows = await db.select().from(rateGroups).where(eq(rateGroups.code, code)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
