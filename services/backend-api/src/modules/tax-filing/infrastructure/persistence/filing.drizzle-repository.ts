import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { filings } from '../../../../db/schema/filings';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IFilingRepository } from '../../domain/ports/filing.repository';
import type { Filing, CreateFilingInput } from '../../domain/tax-filing.types';

function toDomain(row: typeof filings.$inferSelect): Filing {
  return {
    id: row.id,
    tenantId: row.tenantId,
    quarter: row.quarter,
    year: row.year,
    receiptCode: row.receiptCode,
    filedAt: row.filedAt,
  };
}

@Injectable()
export class FilingDrizzleRepository implements IFilingRepository {
  async findByPeriod(tenantId: string, quarter: number, year: number): Promise<Filing | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(filings)
        .where(and(eq(filings.tenantId, tenantId), eq(filings.quarter, quarter), eq(filings.year, year)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<Filing[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(filings).where(eq(filings.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  /** Mandatory trailing `tx` — must run in the same transaction as the caller's `withIdempotency` key-insert, same convention as `InvoiceDrizzleRepository.create`. */
  async create(tenantId: string, input: CreateFilingInput, tx: Db): Promise<Filing> {
    const rows = await tx
      .insert(filings)
      .values({ tenantId, quarter: input.quarter, year: input.year, receiptCode: input.receiptCode })
      .returning();
    return toDomain(rows[0]!);
  }
}
