import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    // Vitest 4 removed `poolOptions` (all previous poolOptions are now
    // top-level) — `pool: 'threads'` alone already defaults to multiple
    // concurrent worker threads, same as the old explicit `singleThread: false`.
    pool: 'threads',
  },
});
