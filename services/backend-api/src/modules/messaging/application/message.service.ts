import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException, ConflictException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { MESSAGE_REPOSITORY, type IMessageRepository } from '../domain/ports/message.repository';
import type { Message, InboundMessageInput } from '../domain/message.types';

@Injectable()
export class MessageService {
  constructor(@Inject(MESSAGE_REPOSITORY) private readonly messageRepository: IMessageRepository) {}

  /**
   * Called only by `InternalMessageController` (connector-hub's Zalo webhook
   * forward). A redelivered provider event resolves to a friendly no-op
   * (`null`), so a 409 never bounces a webhook that already succeeded —
   * same "idempotent receiver" stance as the payments forward path.
   */
  async recordInbound(tenantId: string, input: InboundMessageInput): Promise<Message | null> {
    assertTenantMatchesSession(tenantId);
    return this.messageRepository.recordInboundIfNew(tenantId, input);
  }

  async listMessages(tenantId: string, filter?: { unansweredOnly?: boolean }): Promise<Message[]> {
    assertTenantMatchesSession(tenantId);
    return this.messageRepository.listByTenant(tenantId, filter);
  }

  async getUnansweredCount(tenantId: string): Promise<number> {
    assertTenantMatchesSession(tenantId);
    const unanswered = await this.messageRepository.listByTenant(tenantId, { unansweredOnly: true });
    return unanswered.length;
  }

  async getMessage(id: string, tenantId: string): Promise<Message> {
    assertTenantMatchesSession(tenantId);
    const message = await this.messageRepository.findById(id, tenantId);
    if (!message) throw new NotFoundException('MESSAGE_NOT_FOUND', 'Message not found.');
    return message;
  }

  /**
   * RECORDS the household's reply — it is NOT sent anywhere: no real Zalo
   * outbound API exists yet (the mockup itself only enqueues a simulated
   * send), so v1 marks the exchange answered and stores the answer text.
   * When a real OA send exists, it plugs in after this write.
   */
  async reply(id: string, tenantId: string, content: string): Promise<Message> {
    assertTenantMatchesSession(tenantId);
    const existing = await this.getMessage(id, tenantId);
    if (existing.repliedAt !== null) {
      throw new ConflictException('MESSAGE_ALREADY_REPLIED', 'This message has already been replied to.');
    }
    const updated = await this.messageRepository.setReply(id, tenantId, content, new Date());
    // The guarded UPDATE covers the concurrent-double-reply race; this
    // re-check turns it into the same friendly 409 as the sequential case.
    if (!updated) {
      throw new ConflictException('MESSAGE_ALREADY_REPLIED', 'This message has already been replied to.');
    }
    return updated;
  }
}
