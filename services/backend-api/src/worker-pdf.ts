/**
 * Same "separate process from the HTTP app" split as agent-orchestrator's
 * Temporal worker/client — `pnpm dev` never processes PDF jobs itself,
 * this script does. Uses `NestFactory.createApplicationContext` (no
 * Fastify/HTTP listener) purely to get a correctly-wired `InvoicePdfService`
 * out of the same DI graph the HTTP app uses, rather than hand-constructing
 * its dependency chain (repositories, DB client, tenant-context helpers).
 *
 * Run via `ts-node` (see package.json's `worker:pdf`), NOT `tsx` — found by
 * actually running this against a real BullMQ job: `tsx` (esbuild) doesn't
 * reliably emit TypeScript's `emitDecoratorMetadata` output, which Nest's
 * constructor-based DI depends on for classes with no explicit `@Inject()`
 * token (like `InvoicePdfService`). Under `tsx`, every such dependency came
 * back `undefined` with no error at boot — it only surfaced when a real job
 * ran and crashed on `this.invoiceService.getInvoice is not a function`.
 * `ts-node` uses the real TypeScript compiler, which emits this correctly.
 * agent-orchestrator's `worker.ts` also uses `tsx` safely, but it
 * deliberately never boots a Nest DI container at all (plain functions,
 * explicit arguments) — this is the first script in this repo to combine
 * `tsx` with `NestFactory`, which is exactly what exposed the gap.
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker, type Job } from 'bullmq';
import { AppModule } from './app.module';
import { InvoicePdfService } from './modules/invoicing-tax/application/invoice-pdf.service';
import { runWithTenant } from './platform/tenant-context';
import { getQueueRedisConnection, INVOICE_PDF_QUEUE_NAME, type InvoicePdfJobData } from './platform/queue';

async function main() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const invoicePdfService = appContext.get(InvoicePdfService);

  const worker = new Worker<InvoicePdfJobData>(
    INVOICE_PDF_QUEUE_NAME,
    async (job: Job<InvoicePdfJobData>) => {
      const { invoiceId, tenantId } = job.data;
      // renderInvoicePdf's repositories read `getCurrentTenantId()`
      // indirectly via the services it calls — same ALS-based tenant
      // context as every HTTP request, entered explicitly here since a
      // BullMQ job has no request lifecycle to enter it automatically.
      const buffer = await runWithTenant(tenantId, () => invoicePdfService.renderInvoicePdf(invoiceId, tenantId));
      await invoicePdfService.writeGeneratedPdf(invoiceId, tenantId, buffer);
    },
    { connection: getQueueRedisConnection() },
  );

  worker.on('completed', (job) => console.log(`PDF generated for invoice ${job.data.invoiceId}`));
  worker.on('failed', (job, err) => console.error(`PDF generation failed for invoice ${job?.data.invoiceId}:`, err));

  console.log(`backend-api PDF worker polling queue "${INVOICE_PDF_QUEUE_NAME}"...`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
