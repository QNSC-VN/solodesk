import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    // Real concurrency against one shared test DB — Section 4.5 explicitly
    // requires this to NOT run single-threaded, since the whole point is
    // proving RLS + SET LOCAL hold under real concurrent connection reuse.
    // Vitest 4 removed `poolOptions` (all previous poolOptions are now
    // top-level) — `pool: 'threads'` alone already defaults to multiple
    // concurrent worker threads, which is what the old explicit
    // `singleThread: false` was just confirming, not overriding.
    pool: 'threads',
  },
});
