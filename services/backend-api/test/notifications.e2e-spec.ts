import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { withTenantTransaction } from '../src/platform/tenant-context';
import { tenants } from '../src/db/schema/tenants';
import { users } from '../src/db/schema/users';
import { notifications } from '../src/db/schema/notifications';
import { emailOutbox } from '../src/db/schema/email-outbox';
import { NotificationService } from '../src/modules/notifications/application/notification.service';
import { EmailOutboxRelayService } from '../src/modules/notifications/application/email-outbox-relay.service';
import type { EmailDispatcher } from '../src/modules/notifications/application/email-dispatcher.service';

/**
 * Real Postgres, no mocks — the transactional-outbox write path
 * (`NotificationService.notify`) and the sweep/relay logic
 * (`EmailOutboxRelayService`), split from queue plumbing exactly like
 * `InvoicePdfService` so this is directly testable with a stub
 * `EmailDispatcher`, no live worker process needed.
 */

const notificationService = new NotificationService();

async function seedTenantWithUser(legalName: string): Promise<{ tenantId: string; userId: string }> {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  const [user] = await db
    .insert(users)
    .values({ email: `notif-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, displayName: legalName, emailVerified: true })
    .returning();
  return { tenantId: tenant!.id, userId: user!.id };
}

async function outboxRowsFor(tenantId: string, userId: string) {
  return withTenantTransaction(db, tenantId, (tx) => tx.select().from(emailOutbox).where(eq(emailOutbox.userId, userId)));
}

async function notificationRowsFor(tenantId: string, userId: string) {
  return withTenantTransaction(db, tenantId, (tx) => tx.select().from(notifications).where(eq(notifications.userId, userId)));
}

describe('NotificationService.notify — real Postgres, no mocks', () => {
  it('writes both the in-app notification and the email_outbox row atomically', async () => {
    const { tenantId, userId } = await seedTenantWithUser('Notify Test Tenant');

    await notificationService.notify(tenantId, {
      userId,
      type: 'EMAIL_VERIFY',
      title: 'Test title',
      body: 'Test body',
      email: { templateName: 'EMAIL_VERIFY', vars: { verifyUrl: 'http://localhost/verify?token=abc' } },
    });

    const notes = await notificationRowsFor(tenantId, userId);
    const emails = await outboxRowsFor(tenantId, userId);
    expect(notes).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(emails[0]!.status).toBe('pending');
  });

  it('an in-app-only notification (no email option) writes no email_outbox row', async () => {
    const { tenantId, userId } = await seedTenantWithUser('Notify Test Tenant In-App Only');

    await notificationService.notify(tenantId, { userId, type: 'EINVOICE_THRESHOLD_CROSSED', title: 't', body: 'b' });

    expect(await notificationRowsFor(tenantId, userId)).toHaveLength(1);
    expect(await outboxRowsFor(tenantId, userId)).toHaveLength(0);
  });

  it('a duplicate sourceEventId is a no-op — idempotent dedup', async () => {
    const { tenantId, userId } = await seedTenantWithUser('Notify Test Tenant Dedup');
    const sourceEventId = 'dedup-test-event';

    await notificationService.notify(tenantId, { userId, type: 'EMAIL_VERIFY', title: 't', body: 'b', sourceEventId });
    await notificationService.notify(tenantId, { userId, type: 'EMAIL_VERIFY', title: 't (again)', body: 'b (again)', sourceEventId });

    expect(await notificationRowsFor(tenantId, userId)).toHaveLength(1);
  });

  it('unread-count / mark-read / mark-all-read work against real seeded rows', async () => {
    const { tenantId, userId } = await seedTenantWithUser('Notify Test Tenant Unread');

    await notificationService.notify(tenantId, { userId, type: 'EMAIL_VERIFY', title: 'a', body: 'a' });
    await notificationService.notify(tenantId, { userId, type: 'PASSWORD_RESET', title: 'b', body: 'b' });

    expect(await notificationService.unreadCount(tenantId, userId)).toBe(2);

    const [first] = await notificationService.list(tenantId, userId);
    await notificationService.markRead(tenantId, userId, first!.id);
    expect(await notificationService.unreadCount(tenantId, userId)).toBe(1);

    await notificationService.markAllRead(tenantId, userId);
    expect(await notificationService.unreadCount(tenantId, userId)).toBe(0);
  });
});

describe('EmailOutboxRelayService.processBatch — real Postgres, stub EmailDispatcher', () => {
  it('a successful send marks the row sent', async () => {
    const { tenantId, userId } = await seedTenantWithUser('Relay Test Tenant Success');
    await notificationService.notify(tenantId, {
      userId,
      type: 'EMAIL_VERIFY',
      title: 't',
      body: 'b',
      email: { templateName: 'EMAIL_VERIFY', vars: { verifyUrl: 'http://localhost/verify?token=xyz' } },
    });

    const dispatcher = { dispatch: async () => {} } as unknown as EmailDispatcher;
    const relay = new EmailOutboxRelayService(dispatcher);
    await relay.processBatch();

    const [row] = await outboxRowsFor(tenantId, userId);
    expect(row!.status).toBe('sent');
    expect(row!.sentAt).toBeInstanceOf(Date);
  });

  it('a failed send bumps attempts and schedules backoff, then reaches dead_letter after 5 attempts', async () => {
    const { tenantId, userId } = await seedTenantWithUser('Relay Test Tenant Failure');
    await notificationService.notify(tenantId, {
      userId,
      type: 'PASSWORD_RESET',
      title: 't',
      body: 'b',
      email: { templateName: 'PASSWORD_RESET', vars: { resetUrl: 'http://localhost/reset?token=xyz' } },
    });

    const dispatcher = {
      dispatch: async () => {
        throw new Error('forced failure');
      },
    } as unknown as EmailDispatcher;
    const relay = new EmailOutboxRelayService(dispatcher);

    // Force each retry to be immediately due — the real backoff (30s+) would
    // otherwise make a 5-attempt test take minutes, so the row's
    // `next_attempt_at` is reset to now before each sweep, exercising the
    // real attempts/dead-letter logic without waiting on real wall-clock time.
    for (let i = 0; i < 4; i++) {
      await relay.processBatch();
      await withTenantTransaction(db, tenantId, (tx) => tx.update(emailOutbox).set({ nextAttemptAt: new Date() }).where(eq(emailOutbox.userId, userId)));
    }

    let [row] = await outboxRowsFor(tenantId, userId);
    expect(row!.attempts).toBe(4);
    expect(row!.status).toBe('pending');

    await relay.processBatch();
    [row] = await outboxRowsFor(tenantId, userId);
    expect(row!.attempts).toBe(5);
    expect(row!.status).toBe('dead_letter');
    expect(row!.lastError).toContain('forced failure');
  });
});
