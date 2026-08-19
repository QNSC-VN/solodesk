import { Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotFoundException, PermissionDeniedException } from '@qnsc-vn/platform-http';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { InvoicePdfService } from '../application/invoice-pdf.service';
import { getInvoicePdfQueue } from '../../../platform/queue/invoice-pdf.queue';

@ApiTags('invoices')
@Controller('invoices/:id/pdf')
export class InvoicePdfController {
  constructor(private readonly invoicePdfService: InvoicePdfService) {}

  @Post()
  @ApiOperation({ summary: 'Enqueue PDF generation for an invoice — async, via BullMQ (src/worker-pdf.ts), not rendered inline on this request' })
  async generate(@Param('id', ParseUUIDPipe) id: string): Promise<{ jobId: string }> {
    return this.invoicePdfService.enqueueGeneratePdf(id, getCurrentTenantId());
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Poll a PDF generation job — BullMQ job state (waiting/active/completed/failed)' })
  async jobStatus(@Param('jobId') jobId: string): Promise<{ jobId: string; state: string }> {
    const job = await getInvoicePdfQueue().getJob(jobId);
    if (!job) {
      throw new NotFoundException('PDF_JOB_NOT_FOUND', `No PDF generation job "${jobId}".`);
    }
    // Job data carries the tenantId it was enqueued for — without this
    // check, any authenticated caller could poll ANY tenant's jobId and
    // learn its state, a cross-tenant metadata leak the URL param alone
    // doesn't guard against (jobId isn't scoped by path like the PDF file is).
    if (job.data.tenantId !== getCurrentTenantId()) {
      throw new PermissionDeniedException('PDF_JOB_TENANT_MISMATCH', `Job "${jobId}" does not belong to the caller's tenant.`);
    }
    const state = await job.getState();
    return { jobId, state };
  }

  @Get()
  @ApiOperation({ summary: "Download a generated invoice PDF — 404 if generation hasn't completed yet (POST this same path first)" })
  async download(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: false }) res: FastifyReply): Promise<void> {
    const pdf = await this.invoicePdfService.readGeneratedPdf(id, getCurrentTenantId());
    if (!pdf) {
      throw new NotFoundException('PDF_NOT_GENERATED', `No PDF generated yet for invoice ${id} — POST this same path to enqueue generation first.`);
    }
    res.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${id}.pdf"`).send(pdf);
  }
}
