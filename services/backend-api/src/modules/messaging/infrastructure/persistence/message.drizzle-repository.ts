import { Injectable } from '@nestjs/common';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { messages } from '../../../../db/schema/messages';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IMessageRepository } from '../../domain/ports/message.repository';
import type { Message, InboundMessageInput } from '../../domain/message.types';

function toDomain(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channel: row.channel,
    direction: row.direction,
    customerName: row.customerName,
    content: row.content,
    sourceEventId: row.sourceEventId,
    reply: row.reply,
    repliedAt: row.repliedAt,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class MessageDrizzleRepository implements IMessageRepository {
  async recordInboundIfNew(tenantId: string, input: InboundMessageInput): Promise<Message | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(messages)
        .values({
          tenantId,
          channel: input.channel,
          direction: 'in',
          customerName: input.customerName,
          content: input.content,
          sourceEventId: input.sourceEventId,
          occurredAt: input.occurredAt,
        })
        // Same dedup shape as NotificationService's insert — the UNIQUE
        // (tenant_id, source_event_id) backstop makes the losing insert a
        // no-op, and `returning()` comes back empty for it.
        .onConflictDoNothing()
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string, filter?: { unansweredOnly?: boolean }): Promise<Message[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            filter?.unansweredOnly ? isNull(messages.repliedAt) : undefined,
          ),
        )
        .orderBy(desc(messages.createdAt));
      return rows.map(toDomain);
    });
  }

  async countUnanswered(tenantId: string): Promise<number> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ n: count() })
        .from(messages)
        .where(and(eq(messages.tenantId, tenantId), isNull(messages.repliedAt)));
      return rows[0]?.n ?? 0;
    });
  }

  async findById(id: string, tenantId: string): Promise<Message | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(messages).where(and(eq(messages.id, id), eq(messages.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async setReply(id: string, tenantId: string, reply: string, repliedAt: Date): Promise<Message | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      // Single guarded UPDATE — only an unanswered row matches, so a second
      // reply attempt (or two concurrent ones) changes zero rows and returns
      // null; the service decides whether that's "not found" or "already
      // replied". Same atomicUpdate shape as every state transition here.
      const rows = await tx
        .update(messages)
        .set({ reply, repliedAt })
        .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId), isNull(messages.repliedAt)))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }
}
