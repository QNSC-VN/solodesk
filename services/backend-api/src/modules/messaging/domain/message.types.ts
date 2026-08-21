import type { MessageChannel, MessageDirection } from '../../../db/schema/messages';

export interface Message {
  id: string;
  tenantId: string;
  channel: MessageChannel;
  direction: MessageDirection;
  customerName: string;
  content: string;
  sourceEventId: string;
  reply: string | null;
  repliedAt: Date | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface InboundMessageInput {
  channel: MessageChannel;
  customerName: string;
  content: string;
  sourceEventId: string;
  occurredAt: Date;
}
