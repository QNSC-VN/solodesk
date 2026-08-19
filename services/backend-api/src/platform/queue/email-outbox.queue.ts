import { Queue } from 'bullmq';
import { getQueueRedisConnection } from './redis-connection';

export const EMAIL_OUTBOX_QUEUE_NAME = 'email-outbox-sweep';
export const EMAIL_OUTBOX_SWEEP_JOB_ID = 'email-outbox-sweep';
export const EMAIL_OUTBOX_SWEEP_INTERVAL_MS = 30_000;

let queue: Queue | undefined;

/**
 * Same shape as `invoice-pdf.queue.ts` — the queue side only.
 * `src/worker-notifications.ts` registers ONE repeatable job on this queue
 * (BullMQ dedups repeatable jobs by `jobId`, so calling this at every worker
 * boot is idempotent) and runs the `Worker` that processes it.
 */
export function getEmailOutboxQueue(): Queue {
  if (!queue) {
    queue = new Queue(EMAIL_OUTBOX_QUEUE_NAME, { connection: getQueueRedisConnection() });
  }
  return queue;
}
