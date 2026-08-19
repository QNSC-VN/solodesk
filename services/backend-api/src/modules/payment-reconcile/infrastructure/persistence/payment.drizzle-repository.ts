import { Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { payments } from '../../../../db/schema/payments';
import { withTenantTransaction, withTenantTransactionOrReuse } from '../../../../platform/tenant-context';
import type { IPaymentRepository } from '../../domain/ports/payment.repository';
import type { Payment, CreatePaymentInput } from '../../domain/payment.types';

function toDomain(row: typeof payments.$inferSelect): Payment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    invoiceId: row.invoiceId,
    method: row.method,
    amount: row.amount,
    type: row.type,
    referenceCode: row.referenceCode,
    receivedAt: row.receivedAt,
  };
}

@Injectable()
export class PaymentDrizzleRepository implements IPaymentRepository {
  async findByReferenceCode(tenantId: string, referenceCode: string): Promise<Payment | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.tenantId, tenantId), eq(payments.referenceCode, referenceCode)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByInvoice(invoiceId: string, tenantId: string): Promise<Payment[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(payments).where(and(eq(payments.invoiceId, invoiceId), eq(payments.tenantId, tenantId)));
      return rows.map(toDomain);
    });
  }

  /** Net of refunds: `SUM(amount) WHERE type='payment' - SUM(amount) WHERE type='refund'`, not a plain sum. */
  async sumByInvoice(invoiceId: string, tenantId: string): Promise<string> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          total: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`,
        })
        .from(payments)
        .where(and(eq(payments.invoiceId, invoiceId), eq(payments.tenantId, tenantId)));
      return rows[0]!.total;
    });
  }

  async create(tenantId: string, input: CreatePaymentInput, tx?: Db): Promise<Payment> {
    return withTenantTransactionOrReuse(db, tenantId, tx, async (innerTx) => {
      const rows = await innerTx
        .insert(payments)
        .values({
          tenantId,
          invoiceId: input.invoiceId,
          method: input.method,
          amount: input.amount,
          type: input.type ?? 'payment',
          referenceCode: input.referenceCode ?? null,
        })
        .returning();
      return toDomain(rows[0]!);
    });
  }
}
