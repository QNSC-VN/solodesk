import { Injectable, NotFoundException } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { getTemporalClient } from '../../../temporal/client';
import {
  agentConversationWorkflow,
  sendMessageUpdate,
  getHistoryQuery,
  type ConversationMessage,
  type SendMessageResult,
} from '../../../temporal/workflows/agent-conversation.workflow';

function workflowId(tenantId: string, conversationId: string): string {
  return `agent-conv-${tenantId}-${conversationId}`;
}

/**
 * `workflowId` always embeds the CALLER'S OWN tenantId (from their verified
 * JWT via `@CurrentTenant()`, never a client-supplied value) — a tenant can
 * only ever construct/reach a workflow id containing their own tenantId,
 * which is what makes the workflow-id-embeds-tenant scheme safe despite the
 * workflow itself treating that id as routing/observability only (see the
 * workflow file's header comment).
 */
@Injectable()
export class ConversationService {
  async startConversation(tenantId: string, mode: 'assistant' | 'onboarding' = 'assistant'): Promise<{ conversationId: string }> {
    const client = await getTemporalClient();
    const conversationId = uuidv7();

    await client.start(agentConversationWorkflow, {
      workflowId: workflowId(tenantId, conversationId),
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'agent-tasks',
      args: [tenantId, mode],
    });

    return { conversationId };
  }

  async sendMessage(tenantId: string, conversationId: string, message: string): Promise<SendMessageResult> {
    const client = await getTemporalClient();
    const handle = client.getHandle(workflowId(tenantId, conversationId));
    try {
      return await handle.executeUpdate(sendMessageUpdate, { args: [message] });
    } catch (err) {
      throw this.mapNotFound(err, conversationId);
    }
  }

  async getHistory(tenantId: string, conversationId: string): Promise<ConversationMessage[]> {
    const client = await getTemporalClient();
    const handle = client.getHandle(workflowId(tenantId, conversationId));
    try {
      return await handle.query(getHistoryQuery);
    } catch (err) {
      throw this.mapNotFound(err, conversationId);
    }
  }

  private mapNotFound(err: unknown, conversationId: string): unknown {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('NOT_FOUND')) {
      return new NotFoundException(`Conversation ${conversationId} not found (or has ended).`);
    }
    return err;
  }
}
