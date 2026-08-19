import { eq, and, asc, sql as sqlOp } from 'drizzle-orm';
import { db } from '../../../db/client';
import { invoices } from '../../../db/schema/invoices';
import { payments } from '../../../db/schema/payments';
import { withTenantTransaction } from '../../../platform/tenant-db';

export interface GetOutstandingInvoicesInput {
  tenantId: string;
}

export interface OutstandingInvoice {
  invoiceNumber: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  issuedAt: string;
}

export interface GetOutstandingInvoicesResult {
  invoices: OutstandingInvoice[];
  count: number;
}

export const GET_OUTSTANDING_INVOICES_TOOL_NAME = 'get_outstanding_invoices';

// A real, explicit cap — never an unbounded result set fed back into the
// model's context. Oldest-first, so the cap drops the newest (least
// urgent) invoices first, not the ones most overdue.
const MAX_RESULTS = 20;

export const getOutstandingInvoicesToolSchema = {
  name: GET_OUTSTANDING_INVOICES_TOOL_NAME,
  description: `List the caller's own tenant invoices that are not yet fully paid, oldest first, capped at ${MAX_RESULTS}. Read-only, no arguments.`,
  input_schema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
};

/**
 * Third Layer A tool, and the first that joins two schemas
 * (`tax.invoices`/`payments.payments`) in one query — a single
 * LEFT JOIN + GROUP BY + HAVING, not an N+1 per-invoice loop, computing
 * "outstanding" the same way `payment-reconcile`'s own
 * `PaymentService.getPaymentSummary` does in backend-api (derived from
 * `payments`, never a stored/cached status column that could drift).
 */
export async function getOutstandingInvoices(input: GetOutstandingInvoicesInput): Promise<GetOutstandingInvoicesResult> {
  return withTenantTransaction(db, input.tenantId, async (tx) => {
    const rows = await tx
      .select({
        invoiceNumber: invoices.invoiceNumber,
        totalAmount: invoices.totalAmount,
        issuedAt: invoices.issuedAt,
        paidAmount: sqlOp<string>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(invoices)
      .leftJoin(payments, and(eq(payments.invoiceId, invoices.id), eq(payments.tenantId, invoices.tenantId)))
      .where(and(eq(invoices.tenantId, input.tenantId), eq(invoices.status, 'issued')))
      .groupBy(invoices.id, invoices.invoiceNumber, invoices.totalAmount, invoices.issuedAt)
      .having(sqlOp`${invoices.totalAmount} - COALESCE(SUM(${payments.amount}), 0) > 0`)
      .orderBy(asc(invoices.issuedAt))
      .limit(MAX_RESULTS);

    const results: OutstandingInvoice[] = rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      outstandingAmount: (Number(r.totalAmount) - Number(r.paidAmount)).toFixed(2),
      issuedAt: r.issuedAt.toISOString(),
    }));

    return { invoices: results, count: results.length };
  });
}
