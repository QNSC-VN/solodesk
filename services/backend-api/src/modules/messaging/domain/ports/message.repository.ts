import type { Message, InboundMessageInput } from '../message.types';

export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');

export interface IMessageRepository {
  /** `null` return = a message with this sourceEventId already exists (webhook redelivery) — a friendly no-op, not an error. */
  recordInboundIfNew(tenantId: string, input: InboundMessageInput): Promise<Message | null>;
  listByTenant(tenantId: string, filter?: { unansweredOnly?: boolean }): Promise<Message[]>;
  countUnanswered(tenantId: string): Promise<number>;
  findById(id: string, tenantId: string): Promise<Message | null>;
  /** `null` return = not found or already replied (idempotent re-reply is rejected, the caller decides that's a ConflictException). */
  setReply(id: string, tenantId: string, reply: string, repliedAt: Date): Promise<Message | null>;
}
