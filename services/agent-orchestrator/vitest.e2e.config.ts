import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Workflow-replay tests spin up an ephemeral TestWorkflowEnvironment
    // (@temporalio/testing) per test, real Temporal semantics, no external
    // server needed — slower than a plain DB query, hence the longer timeout.
    testTimeout: 60_000,
    // First run of TestWorkflowEnvironment downloads an ephemeral test-server
    // binary (cached afterward) — needs real time on a cold cache.
    hookTimeout: 120_000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: false } },
  },
});
