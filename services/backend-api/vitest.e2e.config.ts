import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    // Real concurrency against one shared test DB — Section 4.5 explicitly
    // requires this to NOT run single-threaded, since the whole point is
    // proving RLS + SET LOCAL hold under real concurrent connection reuse.
    pool: 'threads',
    poolOptions: { threads: { singleThread: false } },
  },
});
