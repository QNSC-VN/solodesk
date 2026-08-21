import { Injectable } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';
import { db, type Db } from '../../../db/client';
import { withTenantTransactionOrReuse } from '../../../platform/tenant-context';
import { notifications } from '../../../db/schema/notifications';
import { emailOutbox } from '../../../db/schema/email-outbox';
import type { NotifyInput, Notification } from '../domain/notification.types';
import type { NotificationType } from '../../../db/schema/notifications';

function toDomain(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: row.metadata as Record<string, unknown> | null,
    isRead: row.isRead,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/**
 * The transactional-outbox write path (CLAUDE.md's "Notifications"
 * section): always inserts the in-app `notifications` row; when `input.email`
 * is present, ALSO inserts an `email_outbox` row — both via
 * `withTenantTransactionOrReuse` so this composes into a caller's existing
 * transaction (e.g. `InvoiceService.issueInvoice`'s `tx`), never a separate,
 * swallow-on-failure step (the rally bug this design avoids — opshub's fix).
 */
@Injectable()
export class NotificationService {
  async notify<T extends NotificationType>(tenantId: string, input: NotifyInput<T>, tx?: Db): Promise<void> {
    await withTenantTransactionOrReuse(db, tenantId, tx, async (innerTx) => {
      await innerTx
        .insert(notifications)
        .values({
          tenantId,
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          ...(input.sourceEventId !== undefined ? { sourceEventId: input.sourceEventId } : {}),
        })
        .onConflictDoNothing();

      if (input.email) {
        await innerTx
          .insert(emailOutbox)
          .values({
            tenantId,
            userId: input.userId,
            templateName: input.email.templateName,
            templateVars: input.email.vars,
            ...(input.sourceEventId !== undefined ? { sourceEventId: input.sourceEventId } : {}),
          })
          .onConflictDoNothing();
      }
    });
  }

  async list(tenantId: string, userId: string, limit = 50): Promise<Notification[]> {
    return withTenantTransactionOrReuse(db, tenantId, undefined, async (tx) => {
      const rows = await tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      return rows.map(toDomain);
    });
  }

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    return withTenantTransactionOrReuse(db, tenantId, undefined, async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(notifications)
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.isRead, false)));
      return rows[0]?.n ?? 0;
    });
  }

  async markRead(tenantId: string, userId: string, notificationId: string): Promise<void> {
    await withTenantTransactionOrReuse(db, tenantId, undefined, async (tx) => {
      await tx
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)));
    });
  }

  async markAllRead(tenantId: string, userId: string): Promise<void> {
    await withTenantTransactionOrReuse(db, tenantId, undefined, async (tx) => {
      await tx
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.isRead, false)));
    });
  }
}
