import { proxyActivities, defineUpdate, defineQuery, setHandler, condition } from '@temporalio/workflow';
import type * as activities from '../activities';

const { runAgentTurn } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const sendMessageUpdate = defineUpdate<string, [string]>('sendMessage');
export const getHistoryQuery = defineQuery<ConversationMessage[]>('getHistory');

const IDLE_TIMEOUT = '24 hours';

/**
 * One conversation = one Temporal workflow (docs Section 5.2/15) —
 * checkpointed by Temporal after every step, so a worker crash mid-turn
 * resumes cleanly on replay rather than losing state. Deliberately
 * deterministic: the only non-deterministic work (the real Anthropic call,
 * the real Postgres tool query) lives in `runAgentTurn`, an Activity —
 * never inline here.
 *
 * Workflow ID (`agent-conv-{tenantId}-{conversationId}`, set by the
 * caller in `conversation.service.ts`) is for OBSERVABILITY/ROUTING ONLY,
 * matching docs' explicit note — it is NOT the security boundary. The
 * real boundary is that the HTTP layer always derives `tenantId` from the
 * caller's own verified JWT before ever constructing a workflow id, so a
 * tenant can only ever reach a workflow whose id embeds their OWN tenantId.
 *
 * Ends itself after `IDLE_TIMEOUT` with no new message — a real
 * termination policy, not left unbounded. A more sophisticated policy
 * (explicit "end conversation" signal, per-tenant idle budget) is real
 * but separately-scoped future work.
 */
export async function agentConversationWorkflow(tenantId: string): Promise<void> {
  const history: ConversationMessage[] = [];
  let messageReceived = false;

  setHandler(sendMessageUpdate, async (userMessage: string): Promise<string> => {
    const { assistantMessage } = await runAgentTurn({ tenantId, history, userMessage });
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantMessage });
    messageReceived = true;
    return assistantMessage;
  });

  setHandler(getHistoryQuery, () => history);

  for (;;) {
    messageReceived = false;
    const gotMessage = await condition(() => messageReceived, IDLE_TIMEOUT);
    if (!gotMessage) break; // idle timeout elapsed with no new message — end the workflow
  }
}
