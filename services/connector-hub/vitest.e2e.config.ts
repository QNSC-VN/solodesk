import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: false } },
  },
});
