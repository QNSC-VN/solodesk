import { Queue } from 'bullmq';
import { getQueueRedisConnection } from './redis-connection';

export const INVOICE_PDF_QUEUE_NAME = 'invoice-pdf';

export interface InvoicePdfJobData {
  invoiceId: string;
  tenantId: string;
}

let queue: Queue<InvoicePdfJobData> | undefined;

/**
 * The queue side only — enqueues jobs. `src/worker-pdf.ts` (a separate
 * process, same "worker vs HTTP client" split as agent-orchestrator's
 * Temporal worker/client) runs the actual `Worker` that processes them.
 * Docs Section on background jobs: "PDF invoice generation... Valkey is
 * already in the stack... BullMQ works unchanged" — a DIFFERENT tool from
 * Temporal on purpose: Temporal is for agent-orchestrator's durable,
 * long-running AI conversations; BullMQ is for this repo's simpler,
 * short-lived, fire-and-retry Node background jobs. Using Temporal here
 * would be the wrong tool for a job with no multi-day durability need.
 */
export function getInvoicePdfQueue(): Queue<InvoicePdfJobData> {
  if (!queue) {
    queue = new Queue<InvoicePdfJobData>(INVOICE_PDF_QUEUE_NAME, { connection: getQueueRedisConnection() });
  }
  return queue;
}
