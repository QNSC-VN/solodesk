const INVOICE_NUMBER_PATTERN = /INV-\d{4}-\d{6}/;

/**
 * A VietQR transfer's `content` carries whatever note the payer's bank app
 * included — normally the note embedded when the QR was generated, matching
 * backend-api's `InvoiceDrizzleRepository`-assigned format exactly
 * (`INV-2026-000001`). Returns `null` if no such pattern is present (a
 * transfer with no recognizable invoice reference is stored but never
 * forwarded — see `sepay-webhook.controller.ts`).
 */
export function extractInvoiceNumber(content: string): string | null {
  const match = content.match(INVOICE_NUMBER_PATTERN);
  return match ? match[0] : null;
}
