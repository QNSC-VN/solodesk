import { Queue } from 'bullmq';
import { getQueueRedisConnection } from './redis-connection';

export const DOC_EXPIRY_QUEUE_NAME = 'doc-expiry-sweep';
export const DOC_EXPIRY_SWEEP_JOB_ID = 'doc-expiry-sweep';
export const DOC_EXPIRY_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily — document expiry moves in days, not seconds

let queue: Queue | undefined;

/** Same shape as `filing-deadline.queue.ts` — the queue side only; `src/worker-notifications.ts` owns the scheduler + Worker. */
export function getDocExpiryQueue(): Queue {
  if (!queue) {
    queue = new Queue(DOC_EXPIRY_QUEUE_NAME, { connection: getQueueRedisConnection() });
  }
  return queue;
}
