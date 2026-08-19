import { Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { payments } from '../../../../db/schema/payments';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IPaymentRepository } from '../../domain/ports/payment.repository';
import type { Payment, CreatePaymentInput } from '../../domain/payment.types';

function toDomain(row: typeof payments.$inferSelect): Payment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    invoiceId: row.invoiceId,
    method: row.method,
    amount: row.amount,
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

  async sumByInvoice(invoiceId: string, tenantId: string): Promise<string> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ total: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.invoiceId, invoiceId), eq(payments.tenantId, tenantId)));
      return rows[0]!.total;
    });
  }

  async create(tenantId: string, input: CreatePaymentInput): Promise<Payment> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(payments)
        .values({
          tenantId,
          invoiceId: input.invoiceId,
          method: input.method,
          amount: input.amount,
          referenceCode: input.referenceCode ?? null,
        })
        .returning();
      return toDomain(rows[0]!);
    });
  }
}
