import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { uuidv7 } from 'uuidv7';
import { agentConversationWorkflow, sendMessageUpdate, getHistoryQuery } from '../src/temporal/workflows/agent-conversation.workflow';

/**
 * Real Temporal workflow/Activity/Update/Query semantics via
 * `TestWorkflowEnvironment` (an ephemeral, real Temporal test server the
 * SDK provides for exactly this — no external `temporal server start-dev`
 * needed for CI). `runAgentTurn` is stubbed here on purpose: this suite
 * proves WORKFLOW ORCHESTRATION correctness (state accumulation,
 * Update/Query wiring, idle-timeout termination) — the real Anthropic
 * integration inside `run-agent-turn.activity.ts` is exercised separately,
 * against a live Anthropic endpoint, via the dev-server smoke test (no
 * automated test should depend on a real paid API key).
 */

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await TestWorkflowEnvironment.createTimeSkipping();
});

afterAll(async () => {
  await testEnv?.teardown();
});

describe('agentConversationWorkflow', () => {
  it('accumulates history across Updates and exposes it via Query', async () => {
    const taskQueue = `test-${uuidv7()}`;
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath: join(__dirname, '../src/temporal/workflows/index.ts'),
      activities: {
        runAgentTurn: async (input: { userMessage: string }) => ({ assistantMessage: `echo: ${input.userMessage}` }),
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(agentConversationWorkflow, {
        workflowId: `wf-${uuidv7()}`,
        taskQueue,
        args: ['tenant-123'],
      });

      const reply1 = await handle.executeUpdate(sendMessageUpdate, { args: ['hello'] });
      expect(reply1).toEqual({ assistantMessage: 'echo: hello' });

      const reply2 = await handle.executeUpdate(sendMessageUpdate, { args: ['how are you'] });
      expect(reply2).toEqual({ assistantMessage: 'echo: how are you' });

      const history = await handle.query(getHistoryQuery);
      expect(history).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'echo: hello' },
        { role: 'user', content: 'how are you' },
        { role: 'assistant', content: 'echo: how are you' },
      ]);

      await handle.terminate('test cleanup');
    });
  });

  it('carries a Generative UI step descriptor through the Update result when the Activity returns one', async () => {
    const taskQueue = `test-${uuidv7()}`;
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath: join(__dirname, '../src/temporal/workflows/index.ts'),
      activities: {
        runAgentTurn: async () => ({ assistantMessage: 'Anh/chị đang kinh doanh ngành gì?', step: { inputType: 'choice', options: ['Quán ăn', 'Nông sản', 'Du lịch'] } }),
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(agentConversationWorkflow, {
        workflowId: `wf-step-${uuidv7()}`,
        taskQueue,
        args: ['tenant-123', 'onboarding'],
      });

      const reply = await handle.executeUpdate(sendMessageUpdate, { args: ['Xin chào'] });
      expect(reply).toEqual({
        assistantMessage: 'Anh/chị đang kinh doanh ngành gì?',
        step: { inputType: 'choice', options: ['Quán ăn', 'Nông sản', 'Du lịch'] },
      });

      await handle.terminate('test cleanup');
    });
  });

  it('ends itself after the idle timeout with no new message (time-skipping, not a real 24h wait)', async () => {
    const taskQueue = `test-${uuidv7()}`;
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath: join(__dirname, '../src/temporal/workflows/index.ts'),
      activities: {
        runAgentTurn: async () => ({ assistantMessage: 'unused' }),
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(agentConversationWorkflow, {
        workflowId: `wf-idle-${uuidv7()}`,
        taskQueue,
        args: ['tenant-123'],
      });

      // No message ever sent — the workflow completes on its own once the
      // idle window elapses. `result()` resolving at all (rather than
      // hanging) is the assertion.
      await handle.result();
    });
  });
});
