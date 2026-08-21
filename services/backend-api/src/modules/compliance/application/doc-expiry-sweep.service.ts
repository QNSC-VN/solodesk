import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { tenants } from '../../../db/schema/tenants';
import { COMPLIANCE_REPOSITORY, type IComplianceRepository } from '../domain/ports/compliance.repository';
import { TENANT_MEMBER_REPOSITORY, type ITenantMemberRepository } from '../../identity-tenant/domain/ports/tenant.repository';
import { NotificationService } from '../../notifications/application/notification.service';
import { deriveStatus } from '../domain/compliance.types';
import { daysUntil } from '../../../platform/vn-time';

/** The mockup's escalation point — its deadline items flip from warn to todo under 30 days (`d < 30 ? 'todo' : 'warn'`), and a notification is worth the owner's attention exactly there, not at the visual-only 90-day mark. */
const NOTIFY_WITHIN_DAYS = 30;

/**
 * The reminder half of compliance-document tracking — a real nudge, not
 * just a status chip someone has to remember to check. Same shape as
 * `FilingDeadlineSweepService` (which this deliberately copies): iterate
 * active tenants (`identity.tenants` has no RLS — the identical trade-off
 * that sweep and `EmailOutboxRelayService` already document), derive each
 * doc's status at read time, and notify owners when a numbered doc is
 * within `NOTIFY_WITHIN_DAYS` of expiry (or already past it). Deterministic
 * `sourceEventId` per doc+expiry-date means a daily sweep fires exactly ONE
 * notification per document per expiry — renewing (editing `expiresOn`)
 * naturally arms the next one under the new date.
 */
@Injectable()
export class DocExpirySweepService {
  private readonly logger = new Logger(DocExpirySweepService.name);

  constructor(
    @Inject(COMPLIANCE_REPOSITORY) private readonly complianceRepository: IComplianceRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async sweep(): Promise<{ notified: number }> {
    const activeTenants = await db.select({ id: tenants.id, legalName: tenants.legalName }).from(tenants).where(eq(tenants.isActive, true));

    let notified = 0;
    const now = new Date();
    for (const tenant of activeTenants) {
      try {
        if (await this.maybeNotify(tenant.id, tenant.legalName, now)) notified++;
      } catch (err) {
        this.logger.error(`doc-expiry sweep failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { notified };
  }

  private async maybeNotify(tenantId: string, legalName: string, now: Date): Promise<boolean> {
    const docs = await this.complianceRepository.listByTenant(tenantId);
    const expiring = docs.filter((d) => {
      if (!d.documentNumber || !d.expiresOn) return false; // missing docs are a list-screen concern; no-expiry docs never expire
      const status = deriveStatus(d, now);
      if (status !== 'expiring' && status !== 'expired') return false;
      return daysUntil(now, d.expiresOn) <= NOTIFY_WITHIN_DAYS || status === 'expired';
    });
    if (expiring.length === 0) return false;

    const owners = await this.memberRepository.listOwners(tenantId);
    if (owners.length === 0) return false;

    for (const doc of expiring) {
      const days = daysUntil(now, doc.expiresOn!);
      const body =
        days >= 0
          ? `Giấy tờ "${doc.docType}" (số ${doc.documentNumber}) của ${legalName} còn ${days} ngày hạn — hết hạn ${doc.expiresOn}.`
          : `Giấy tờ "${doc.docType}" (số ${doc.documentNumber}) của ${legalName} ĐÃ HẾT HẠN (${doc.expiresOn}).`;
      for (const owner of owners) {
        await this.notificationService.notify(tenantId, {
          userId: owner.userId,
          type: 'DOC_EXPIRY_APPROACHING',
          title: `Giấy tờ sắp hết hạn — ${doc.docType}`,
          body,
          sourceEventId: `doc-expiry-${doc.id}-${doc.expiresOn}`,
        });
      }
    }
    return true;
  }
}
