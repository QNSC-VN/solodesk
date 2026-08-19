import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { InvoiceService } from './invoice.service';
import { OrderService } from '../../sales-order/application/order.service';
import { TenantService } from '../../identity-tenant/application/tenant.service';
import { CatalogService } from '../../catalog-inventory/application/catalog.service';
import { getInvoicePdfQueue, type InvoicePdfJobData } from '../../../platform/queue/invoice-pdf.queue';
import type { Env } from '../../../config/env.schema';

const ORDER_CHANNEL_LABELS: Record<string, string> = {
  counter: 'Tại quầy',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  lazada: 'Lazada',
  phone: 'Điện thoại',
  other: 'Khác',
};

/**
 * pdfkit's built-in fonts (Helvetica etc.) are the PDF standard 14 fonts —
 * WinAnsi-encoded, NO Vietnamese glyph coverage at all. Found by actually
 * downloading and reading a real generated PDF, not by assuming: every
 * diacritic silently dropped, đ/Đ rendered as nothing, garbling the whole
 * invoice (this is a 100%-Vietnamese document). Fix is a real embedded
 * Unicode font, not a pdfkit config flag. @fontsource's per-script-subset
 * WOFF2 files (e.g. its "vietnamese" subset) are NOT usable standalone —
 * verified directly: that file contains ONLY Vietnamese-specific glyphs
 * (đ/ơ/ư and precomposed diacritic vowels), no base Latin a-z at all, by
 * design for browsers that layer multiple @font-face subsets together.
 * pdfkit needs ONE file with every glyph the document uses, so this
 * vendors Google Fonts' actual complete Noto Sans variable font (full
 * Unicode coverage in one file) instead — verified by rendering
 * "Xin chào, đây là hóa đơn ưu đãi! HÓA ĐƠN" and reading the resulting
 * PDF back before trusting it.
 */
const FONT_PATH = join(__dirname, '../../../../assets/fonts/NotoSans-VF.ttf');

/**
 * The rendering logic, separate from the queue/worker wiring so it's
 * directly testable without needing a running Worker process — same
 * "split the pure logic from the async transport" shape as
 * agent-orchestrator's `searchByEmbedding`/`searchKnowledgeBase` split.
 * Deliberately no itemized-line SKU-name resolution beyond what
 * `OrderService.getOrder` + `CatalogService.getSku` already provide —
 * small N per invoice (one household order's line count), so the
 * per-line `getSku` call is a non-issue, not a hot-path N+1 concern.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly orderService: OrderService,
    private readonly tenantService: TenantService,
    private readonly catalogService: CatalogService,
    private readonly config: ConfigService<Env>,
  ) {}

  async renderInvoicePdf(invoiceId: string, tenantId: string): Promise<Buffer> {
    const invoice = await this.invoiceService.getInvoice(invoiceId, tenantId);
    const order = await this.orderService.getOrder(invoice.orderId, tenantId);
    const tenant = await this.tenantService.getTenant(tenantId);

    const lines = await Promise.all(
      order.lines.map(async (line) => {
        const sku = await this.catalogService.getSku(line.skuId, tenantId);
        return { skuName: sku.name, quantity: line.quantity, unit: sku.unit, unitPrice: line.unitPrice, lineTotal: line.lineTotal };
      }),
    );

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('Body', FONT_PATH).font('Body');

      doc.fontSize(18).text(tenant.legalName, { align: 'left' });
      doc.fontSize(20).text('HÓA ĐƠN', { align: 'right' });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Số hóa đơn: ${invoice.invoiceNumber}`);
      doc.text(`Ngày lập: ${invoice.issuedAt.toLocaleDateString('vi-VN')}`);
      doc.text(`Khách hàng: ${order.customerName ?? 'Khách lẻ'}`);
      doc.text(`Kênh bán: ${ORDER_CHANNEL_LABELS[order.channel] ?? order.channel}`);
      doc.moveDown(1);

      const tableTop = doc.y;
      doc.fontSize(10).text('Sản phẩm', 50, tableTop, { width: 200 });
      doc.text('SL', 250, tableTop, { width: 60, align: 'right' });
      doc.text('Đơn giá', 310, tableTop, { width: 100, align: 'right' });
      doc.text('Thành tiền', 410, tableTop, { width: 100, align: 'right' });
      doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).stroke();
      doc.moveDown(0.5);

      for (const line of lines) {
        const y = doc.y;
        doc.text(line.skuName, 50, y, { width: 200 });
        doc.text(`${line.quantity} ${line.unit}`, 250, y, { width: 60, align: 'right' });
        doc.text(line.unitPrice, 310, y, { width: 100, align: 'right' });
        doc.text(line.lineTotal, 410, y, { width: 100, align: 'right' });
        doc.moveDown(0.3);
      }

      doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).stroke();
      doc.moveDown(1);

      doc.fontSize(11).text(`Tạm tính: ${invoice.subtotal}đ`, { align: 'right' });
      doc.text(`Thuế (${(Number(invoice.taxRate) * 100).toFixed(2)}%): ${invoice.taxAmount}đ`, { align: 'right' });
      doc.fontSize(13).text(`Tổng cộng: ${invoice.totalAmount}đ`, { align: 'right' });

      if (invoice.requiresEInvoice) {
        doc.moveDown(1);
        doc.fontSize(9).fillColor('#666').text('Hóa đơn này thuộc diện phải xuất hóa đơn điện tử theo quy định.', { align: 'left' });
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999').text('Được tạo bởi SoloDesk — Chương trình Kế nghiệp số Gia Lai', { align: 'center' });

      doc.end();
    });
  }

  async enqueueGeneratePdf(invoiceId: string, tenantId: string): Promise<{ jobId: string }> {
    // Fails loud, before enqueuing, if the invoice doesn't exist or isn't
    // this tenant's — same tenant-ownership check every other invoice
    // endpoint gets, not deferred to the worker where a bad job would
    // just silently fail later with less context.
    await this.invoiceService.getInvoice(invoiceId, tenantId);

    const job = await getInvoicePdfQueue().add('generate', { invoiceId, tenantId } satisfies InvoicePdfJobData);
    return { jobId: job.id! };
  }

  async readGeneratedPdf(invoiceId: string, tenantId: string): Promise<Buffer | null> {
    const path = this.pdfPath(tenantId, invoiceId);
    if (!existsSync(path)) return null;
    return readFile(path);
  }

  async writeGeneratedPdf(invoiceId: string, tenantId: string, buffer: Buffer): Promise<void> {
    const path = this.pdfPath(tenantId, invoiceId);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, buffer);
  }

  private pdfPath(tenantId: string, invoiceId: string): string {
    const dir = this.config.get('GENERATED_FILES_DIR', { infer: true })!;
    return join(dir, 'invoices', tenantId, `${invoiceId}.pdf`);
  }
}
