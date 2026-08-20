import { Inject, Injectable } from '@nestjs/common';
import { ConflictException } from '@qnsc-vn/platform-http';
import { db } from '../../../db/client';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { FILING_REPOSITORY, type IFilingRepository } from '../domain/ports/filing.repository';
import type { Filing } from '../domain/tax-filing.types';

/**
 * "Nhập mã biên nhận, đóng sổ kỳ" (the mockup's own receipt-code close
 * step) as a real write. No receipt-code format validation — the mockup
 * itself accepts any non-empty string (no real eTax API to validate
 * against yet); `UNIQUE (tenant_id, quarter, year)` is the real "can't file
 * the same quarter twice" guarantee, not an app-level check.
 */
@Injectable()
export class FilingService {
  constructor(@Inject(FILING_REPOSITORY) private readonly filingRepository: IFilingRepository) {}

  async recordFiling(tenantId: string, quarter: number, year: number, receiptCode: string, idempotencyKey: string): Promise<Filing> {
    assertTenantMatchesSession(tenantId);

    return withTenantTransaction(db, tenantId, (tx) =>
      withIdempotency(tx, tenantId, idempotencyKey, async () => {
        const existing = await this.filingRepository.findByPeriod(tenantId, quarter, year);
        if (existing) {
          throw new ConflictException('QUARTER_ALREADY_FILED', `Q${quarter}/${year} was already filed with receipt code "${existing.receiptCode}".`);
        }
        return this.filingRepository.create(tenantId, { quarter, year, receiptCode }, tx);
      }),
    );
  }

  async listFilings(tenantId: string): Promise<Filing[]> {
    assertTenantMatchesSession(tenantId);
    return this.filingRepository.listByTenant(tenantId);
  }
}
