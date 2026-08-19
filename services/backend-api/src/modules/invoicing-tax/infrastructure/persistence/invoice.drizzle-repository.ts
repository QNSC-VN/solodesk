import { Injectable } from '@nestjs/common';
import { eq, and, gte, sql } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { invoices } from '../../../../db/schema/invoices';
import { invoiceSequences } from '../../../../db/schema/invoice-sequences';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IInvoiceRepository, CreateInvoiceInput } from '../../domain/ports/invoice.repository';
import type { Invoice } from '../../domain/invoice.types';

function toDomain(row: typeof invoices.$inferSelect): Invoice {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orderId: row.orderId,
    invoiceNumber: row.invoiceNumber,
    taxRuleId: row.taxRuleId,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    requiresEInvoice: row.requiresEInvoice,
    status: row.status,
    issuedAt: row.issuedAt,
  };
}

async function nextInvoiceNumber(tx: Db, tenantId: string, issuedAt: Date): Promise<string> {
  const rows = await tx
    .insert(invoiceSequences)
    .values({ tenantId, nextNumber: 2 })
    .onConflictDoUpdate({
      target: invoiceSequences.tenantId,
      set: { nextNumber: sql`${invoiceSequences.nextNumber} + 1` },
    })
    .returning();
  const assigned = rows[0]!.nextNumber - 1;
  return `INV-${issuedAt.getUTCFullYear()}-${String(assigned).padStart(6, '0')}`;
}

@Injectable()
export class InvoiceDrizzleRepository implements IInvoiceRepository {
  async findById(id: string, tenantId: string): Promise<Invoice | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async findByOrderId(orderId: string, tenantId: string): Promise<Invoice | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.orderId, orderId), eq(invoices.tenantId, tenantId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async findByInvoiceNumber(invoiceNumber: string, tenantId: string): Promise<Invoice | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.invoiceNumber, invoiceNumber), eq(invoices.tenantId, tenantId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<Invoice[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(invoices).where(eq(invoices.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  async sumIssuedSubtotalSince(tenantId: string, since: Date): Promise<string> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ total: sql<string>`COALESCE(SUM(${invoices.subtotal}), 0)` })
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'issued'), gte(invoices.issuedAt, since)));
      return rows[0]!.total;
    });
  }

  /**
   * Takes `tx` explicitly, mandatory — no internal `withTenantTransaction`
   * of its own. `InvoiceService.issueInvoice` must run this in the SAME
   * transaction as its `withIdempotency` key-insert (Mục 5.2): the key and
   * the invoice commit or roll back together, or a failed attempt could
   * "burn" the key and permanently block a legitimate retry. Same
   * mandatory-trailing-tx convention as `OrderDrizzleRepository.create`.
   */
  async create(tenantId: string, input: CreateInvoiceInput, tx: Db): Promise<Invoice> {
    // One clock source for both the number's year and issuedAt — relying
    // on the column's defaultNow() (Postgres clock) for issuedAt while
    // deriving the year from Node's clock let the two disagree near a
    // year boundary under any clock skew (same bug family already fixed
    // in traceability's lot-trace repository).
    const issuedAt = new Date();
    const invoiceNumber = await nextInvoiceNumber(tx, tenantId, issuedAt);
    const rows = await tx
      .insert(invoices)
      .values({
        tenantId,
        orderId: input.orderId,
        invoiceNumber,
        taxRuleId: input.taxRuleId,
        subtotal: input.subtotal,
        taxRate: input.taxRate,
        taxAmount: input.taxAmount,
        totalAmount: input.totalAmount,
        requiresEInvoice: input.requiresEInvoice,
        issuedAt,
      })
      .returning();
    return toDomain(rows[0]!);
  }
}
