import type { Invoice } from '../invoice.types';

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');

export interface CreateInvoiceInput {
  orderId: string;
  taxRuleId: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  requiresEInvoice: boolean;
}

export interface IInvoiceRepository {
  findById(id: string, tenantId: string): Promise<Invoice | null>;
  findByOrderId(orderId: string, tenantId: string): Promise<Invoice | null>;
  /** Human-readable lookup (`INV-2026-000001`) — the form a bank-transfer content/QR note carries, not a UUID. Used by connector-hub's forwarded-payment path. */
  findByInvoiceNumber(invoiceNumber: string, tenantId: string): Promise<Invoice | null>;
  listByTenant(tenantId: string): Promise<Invoice[]>;
  /** Sum of `subtotal` for all `issued` invoices with `issuedAt >= since` — the cumulative-annual-revenue input to the e-invoice threshold check. */
  sumIssuedSubtotalSince(tenantId: string, since: Date): Promise<string>;
  /** Assigns the next per-tenant invoice number and inserts, atomically, in one transaction — see `invoice-sequences.ts`. */
  create(tenantId: string, input: CreateInvoiceInput): Promise<Invoice>;
}
