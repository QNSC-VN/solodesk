import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../../../db/client';
import { tenants } from '../../../db/schema/tenants';
import { FILING_REPOSITORY, type IFilingRepository } from '../domain/ports/filing.repository';
import { TENANT_MEMBER_REPOSITORY, type ITenantMemberRepository } from '../../identity-tenant/domain/ports/tenant.repository';
import { NotificationService } from '../../notifications/application/notification.service';
import { currentQuarter, filingDeadline } from '../domain/filing-period';
import { daysUntil } from '../../../platform/vn-time';

const WARN_WITHIN_DAYS = 14; // matches the mockup's own deadline-card `warn` threshold

/**
 * The reminder half of "Bán khi mất mạng"'s sibling feature — a real
 * filing-deadline nudge, not just a number on a screen someone has to
 * remember to check. Iterates every active tenant (`identity.tenants` has
 * no RLS of its own — same real trade-off `EmailOutboxRelayService`
 * already documents for the identical shape of sweep) with a
 * `taxGroupDefault` set; skips ones that already filed the current
 * quarter or aren't within `WARN_WITHIN_DAYS` of the deadline yet.
 * `sourceEventId` is deterministic per tenant+quarter, so re-running this
 * sweep daily for two weeks fires exactly ONE real notification per
 * tenant per quarter, not fourteen — the same dedup guarantee
 * `InvoiceService.issueInvoice`'s threshold-crossing notification relies on.
 */
@Injectable()
export class FilingDeadlineSweepService {
  private readonly logger = new Logger(FilingDeadlineSweepService.name);

  constructor(
    @Inject(FILING_REPOSITORY) private readonly filingRepository: IFilingRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async sweep(): Promise<{ notified: number }> {
    const activeTenants = await db
      .select({ id: tenants.id, legalName: tenants.legalName, taxGroupDefault: tenants.taxGroupDefault })
      .from(tenants)
      .where(and(eq(tenants.isActive, true), isNotNull(tenants.taxGroupDefault)));

    let notified = 0;
    const now = new Date();
    for (const tenant of activeTenants) {
      try {
        if (await this.maybeNotify(tenant.id, tenant.legalName, now)) notified++;
      } catch (err) {
        this.logger.error(`filing-deadline sweep failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { notified };
  }

  private async maybeNotify(tenantId: string, legalName: string, now: Date): Promise<boolean> {
    const { quarter, year } = currentQuarter(now);
    const alreadyFiled = await this.filingRepository.findByPeriod(tenantId, quarter, year);
    if (alreadyFiled) return false;

    const deadline = filingDeadline(quarter, year);
    const daysRemaining = daysUntil(now, deadline.toISOString().slice(0, 10));
    if (daysRemaining > WARN_WITHIN_DAYS) return false;

    const owners = await this.memberRepository.listOwners(tenantId);
    if (owners.length === 0) return false;

    const deadlineLabel = deadline.toISOString().slice(0, 10);
    const body =
      daysRemaining >= 0
        ? `Còn ${daysRemaining} ngày tới hạn kê khai và nộp thuế quý ${quarter}/${year} — hạn ${deadlineLabel}. Số liệu tạm tính, cần đối chiếu văn bản hiện hành.`
        : `Đã quá hạn kê khai và nộp thuế quý ${quarter}/${year} (hạn ${deadlineLabel}) ${-daysRemaining} ngày.`;

    for (const owner of owners) {
      await this.notificationService.notify(tenantId, {
        userId: owner.userId,
        type: 'FILING_DEADLINE_APPROACHING',
        title: `Sắp đến hạn kê khai thuế — ${legalName}`,
        body,
        sourceEventId: `filing-deadline-${tenantId}-Q${quarter}-${year}`,
      });
    }
    return true;
  }
}
