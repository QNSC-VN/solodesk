import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { users } from '../src/db/schema/users';
import { runWithTenant, withTenantTransaction } from '../src/platform/tenant-context';
import { ComplianceDrizzleRepository } from '../src/modules/compliance/infrastructure/persistence/compliance.drizzle-repository';
import { ComplianceService } from '../src/modules/compliance/application/compliance.service';
import { DocExpirySweepService } from '../src/modules/compliance/application/doc-expiry-sweep.service';
import { TenantMemberDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant-member.drizzle-repository';
import { NotificationService } from '../src/modules/notifications/application/notification.service';
import { notifications } from '../src/db/schema/notifications';
import { eq, and } from 'drizzle-orm';

/** Compliance-document tracking (gap #6) — real Postgres, no mocks. */

const repo = new ComplianceDrizzleRepository();
const service = new ComplianceService(repo);
const sweep = new DocExpirySweepService(repo, new TenantMemberDrizzleRepository(), new NotificationService());

async function seedTenantWithOwner(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  const tenantId = tenant!.id;
  const email = `compliance-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const [user] = await db.insert(users).values({ email, passwordHash: 'x', displayName: legalName, emailVerified: true }).returning();
  await new TenantMemberDrizzleRepository().add({ tenantId, userId: user!.id, displayName: legalName, role: 'owner', canEdit: true });
  return tenantId;
}

describe('Compliance documents — real Postgres, no mocks', () => {
  it('derives status at read time: missing / expired / expiring / valid, plus the incomplete count', async () => {
    const tenantId = await seedTenantWithOwner('Compliance Tenant Derive');
    await runWithTenant(tenantId, async () => {
      await service.createDocument(tenantId, { docType: 'Giấy ATTP', documentNumber: 'GL-0412/2024', expiresOn: '2027-01-01' }, `k-${Date.now()}-1`);
      await service.createDocument(tenantId, { docType: 'Mẫu nhãn', isMandatory: true }, `k-${Date.now()}-2`); // no number = missing
      await service.createDocument(tenantId, { docType: 'Kiểm nghiệm', documentNumber: 'KN-9', expiresOn: '2026-08-01' }, `k-${Date.now()}-3`); // past
      await service.createDocument(tenantId, { docType: 'ATTP2', documentNumber: 'GL-99', expiresOn: '2026-10-15' }, `k-${Date.now()}-4`); // ~55 days = expiring (≤90)
    });

    const list = await runWithTenant(tenantId, () => service.listDocuments(tenantId));
    const byType = Object.fromEntries(list.map((d) => [d.docType, d]));
    expect(byType['Giấy ATTP']!.status).toBe('valid');
    expect(byType['Mẫu nhãn']!.status).toBe('missing');
    expect(byType['Kiểm nghiệm']!.status).toBe('expired');
    expect(byType['ATTP2']!.status).toBe('expiring');
    expect(list[0]!.incompleteCount).toBe(2); // missing + expired
  });

  it('update edits the row (renewal = new expiresOn), delete removes it', async () => {
    const tenantId = await seedTenantWithOwner('Compliance Tenant Update');
    const created = await runWithTenant(tenantId, () =>
      service.createDocument(tenantId, { docType: 'Đăng kiểm PTTS', documentNumber: 'DK-1', expiresOn: '2026-09-30' }, `k-${Date.now()}-5`),
    );

    const renewed = await runWithTenant(tenantId, () =>
      service.updateDocument(created.id, tenantId, { expiresOn: '2027-09-30' }),
    );
    expect(renewed.expiresOn).toBe('2027-09-30');
    expect(renewed.status).toBe('valid');

    await runWithTenant(tenantId, () => service.deleteDocument(created.id, tenantId));
    const after = await runWithTenant(tenantId, () => service.listDocuments(tenantId));
    expect(after).toHaveLength(0);
  });

  it('an idempotent create replays the same document, a fresh key creates a new row', async () => {
    const tenantId = await seedTenantWithOwner('Compliance Tenant Idem');
    const key = `k-${Date.now()}-6`;
    const first = await runWithTenant(tenantId, () => service.createDocument(tenantId, { docType: 'TX', documentNumber: 'TX-1' }, key));
    const replay = await runWithTenant(tenantId, () => service.createDocument(tenantId, { docType: 'TX', documentNumber: 'TX-1' }, key));
    expect(replay.id).toBe(first.id);
    const second = await runWithTenant(tenantId, () => service.createDocument(tenantId, { docType: 'TX', documentNumber: 'TX-2' }, `k-${Date.now()}-7`));
    expect(second.id).not.toBe(first.id);
    const list = await runWithTenant(tenantId, () => service.listDocuments(tenantId));
    expect(list).toHaveLength(2);
  });

  it('the expiry sweep notifies owners exactly once per doc+expiry, and only inside the 30-day window', async () => {
    const tenantId = await seedTenantWithOwner('Compliance Tenant Sweep');
    // 10 days out → notify; far future → silent; missing → silent.
    await runWithTenant(tenantId, async () => {
      await service.createDocument(tenantId, { docType: 'ATTP gần hạn', documentNumber: 'N-1', expiresOn: futureDate(10) }, `k-${Date.now()}-8`);
      await service.createDocument(tenantId, { docType: 'ATTP xa', documentNumber: 'N-2', expiresOn: futureDate(200) }, `k-${Date.now()}-9`);
      await service.createDocument(tenantId, { docType: 'ATTP thiếu', isMandatory: true }, `k-${Date.now()}-10`);
    });

    const firstRun = await sweep.sweep();
    expect(firstRun.notified).toBeGreaterThanOrEqual(1);
    const rows = await withTenantTransaction(db, tenantId, (tx) =>
      tx.select().from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.type, 'DOC_EXPIRY_APPROACHING'))),
    );
    expect(rows).toHaveLength(1); // exactly one doc, one owner, one notification
    expect(rows[0]!.sourceEventId).toMatch(/^doc-expiry-.*-\d{4}-\d{2}-\d{2}$/);

    // Second sweep run: deterministic sourceEventId dedups — still one row.
    await sweep.sweep();
    const rowsAfter = await withTenantTransaction(db, tenantId, (tx) =>
      tx.select().from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.type, 'DOC_EXPIRY_APPROACHING'))),
    );
    expect(rowsAfter).toHaveLength(1);
  });

  it("one tenant's documents are invisible to another (RLS scoping)", async () => {
    const tenantA = await seedTenantWithOwner('Compliance Tenant Iso A');
    const tenantB = await seedTenantWithOwner('Compliance Tenant Iso B');
    await runWithTenant(tenantA, () => service.createDocument(tenantA, { docType: 'Chỉ A', documentNumber: 'A-1' }, `k-${Date.now()}-11`));
    const listB = await runWithTenant(tenantB, () => service.listDocuments(tenantB));
    expect(listB).toHaveLength(0);
  });
});

function futureDate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
