import { Queue } from 'bullmq';
import { getQueueRedisConnection } from './redis-connection';

export const FILING_DEADLINE_QUEUE_NAME = 'filing-deadline-sweep';
export const FILING_DEADLINE_SWEEP_JOB_ID = 'filing-deadline-sweep';
export const FILING_DEADLINE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily — a filing deadline moves in days, not seconds

let queue: Queue | undefined;

/**
 * Same shape as `email-outbox.queue.ts` — the queue side only.
 * `src/worker-notifications.ts` registers ONE repeatable job on this queue
 * (idempotent by `jobId`, safe to call at every worker boot) and runs the
 * `Worker` that processes it, alongside (not instead of) the email-outbox
 * sweep already running in that same process — one lightweight daily job
 * doesn't earn a new deployable worker process.
 */
export function getFilingDeadlineQueue(): Queue {
  if (!queue) {
    queue = new Queue(FILING_DEADLINE_QUEUE_NAME, { connection: getQueueRedisConnection() });
  }
  return queue;
}
