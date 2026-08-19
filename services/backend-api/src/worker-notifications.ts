/**
 * Same "separate process from the HTTP app" split as `worker-pdf.ts` — run
 * via `ts-node`, NOT `tsx` (same documented reason: constructor-based Nest
 * DI depends on `emitDecoratorMetadata`, which `tsx`/esbuild doesn't
 * reliably emit — see `worker-pdf.ts`'s own header comment for the full
 * story of the bug this avoids).
 *
 * Registers ONE BullMQ repeatable job (idempotent — BullMQ dedups by
 * `jobId`, so this is safe to call on every worker boot/restart) and runs
 * the `Worker` that processes it by calling
 * `EmailOutboxRelayService.processBatch()` — a periodic sweep, not a
 * per-message queue (see that service's own header comment for why: RLS on
 * `email_outbox` means the sweep iterates tenants itself).
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { EmailOutboxRelayService } from './modules/notifications/application/email-outbox-relay.service';
import { getQueueRedisConnection } from './platform/queue/redis-connection';
import { getEmailOutboxQueue, EMAIL_OUTBOX_QUEUE_NAME, EMAIL_OUTBOX_SWEEP_JOB_ID, EMAIL_OUTBOX_SWEEP_INTERVAL_MS } from './platform/queue/email-outbox.queue';

async function main() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const relayService = appContext.get(EmailOutboxRelayService);

  // BullMQ v6 moved repeatable-job scheduling off Queue.add's JobsOptions
  // onto its own upsertJobScheduler API — idempotent by schedulerId, safe
  // to call on every worker boot/restart.
  await getEmailOutboxQueue().upsertJobScheduler(EMAIL_OUTBOX_SWEEP_JOB_ID, { every: EMAIL_OUTBOX_SWEEP_INTERVAL_MS }, { name: 'sweep' });

  const worker = new Worker(
    EMAIL_OUTBOX_QUEUE_NAME,
    async () => {
      const { processed } = await relayService.processBatch();
      if (processed > 0) console.log(`email_outbox sweep processed ${processed} row(s)`);
    },
    { connection: getQueueRedisConnection() },
  );

  worker.on('failed', (job, err) => console.error(`email_outbox sweep job ${job?.id} failed:`, err));

  console.log(`backend-api notifications worker polling queue "${EMAIL_OUTBOX_QUEUE_NAME}" every ${EMAIL_OUTBOX_SWEEP_INTERVAL_MS}ms...`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
