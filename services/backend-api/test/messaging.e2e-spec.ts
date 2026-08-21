import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { runWithTenant } from '../src/platform/tenant-context';
import { MessageDrizzleRepository } from '../src/modules/messaging/infrastructure/persistence/message.drizzle-repository';
import { MessageService } from '../src/modules/messaging/application/message.service';
import { ConflictException } from '@qnsc-vn/platform-http';

/** Customer-messaging loop (gap #5) — real Postgres, no mocks. */

const repo = new MessageDrizzleRepository();
const service = new MessageService(repo);

async function seedTenant(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'tourism' }).returning();
  return tenant!.id;
}

function inboundInput(sourceEventId: string, customerName = 'Chi Ngoc') {
  return {
    channel: 'zalo' as const,
    customerName,
    content: 'Mai ben minh con cho di cano khong em',
    sourceEventId,
    occurredAt: new Date('2026-08-21T15:14:00Z'),
  };
}

describe('Inbound customer messaging — real Postgres, no mocks', () => {
  it('records an inbound message, lists it, and counts it unanswered', async () => {
    const tenantId = await seedTenant('Messaging Tenant Basic');
    const message = await runWithTenant(tenantId, () => service.recordInbound(tenantId, inboundInput('z-msg-a')));
    expect(message).not.toBeNull();
    expect(message!.customerName).toBe('Chi Ngoc');
    expect(message!.direction).toBe('in');
    expect(message!.reply).toBeNull();

    const list = await runWithTenant(tenantId, () => service.listMessages(tenantId));
    expect(list).toHaveLength(1);
    const count = await runWithTenant(tenantId, () => service.getUnansweredCount(tenantId));
    expect(count).toBe(1);
  });

  it('a redelivered sourceEventId is a no-op, not an error (webhook idempotent receiver)', async () => {
    const tenantId = await seedTenant('Messaging Tenant Dedup');
    await runWithTenant(tenantId, () => service.recordInbound(tenantId, inboundInput('z-msg-b')));
    const duplicate = await runWithTenant(tenantId, () => service.recordInbound(tenantId, inboundInput('z-msg-b')));
    expect(duplicate).toBeNull();

    const list = await runWithTenant(tenantId, () => service.listMessages(tenantId));
    expect(list).toHaveLength(1);
  });

  it('reply stores the answer text, flips the unanswered count, and a second reply is a 409', async () => {
    const tenantId = await seedTenant('Messaging Tenant Reply');
    const message = (await runWithTenant(tenantId, () => service.recordInbound(tenantId, inboundInput('z-msg-c'))))!;

    const replied = await runWithTenant(tenantId, () => service.reply(message.id, tenantId, 'Da con, em giu cho anh 4 cho.'));
    expect(replied.reply).toBe('Da con, em giu cho anh 4 cho.');
    expect(replied.repliedAt).not.toBeNull();
    expect(await runWithTenant(tenantId, () => service.getUnansweredCount(tenantId))).toBe(0);

    const unansweredOnly = await runWithTenant(tenantId, () => service.listMessages(tenantId, { unansweredOnly: true }));
    expect(unansweredOnly).toHaveLength(0);

    await expect(
      runWithTenant(tenantId, () => service.reply(message.id, tenantId, 'Gui lai lan nua.')),
    ).rejects.toThrow(ConflictException);
  });

  it("one tenant's messages are invisible to another (RLS scoping)", async () => {
    const tenantA = await seedTenant('Messaging Tenant Isolation A');
    const tenantB = await seedTenant('Messaging Tenant Isolation B');
    await runWithTenant(tenantA, () => service.recordInbound(tenantA, inboundInput('z-msg-d', 'Khach A')));
    await runWithTenant(tenantB, () => service.recordInbound(tenantB, inboundInput('z-msg-e', 'Khach B')));

    const listB = await runWithTenant(tenantB, () => service.listMessages(tenantB));
    expect(listB).toHaveLength(1);
    expect(listB[0]!.customerName).toBe('Khach B');
  });
});
