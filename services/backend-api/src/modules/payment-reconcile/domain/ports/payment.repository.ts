import type { Db } from '../../../../db/client';
import type { Payment, CreatePaymentInput } from '../payment.types';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface IPaymentRepository {
  findByReferenceCode(tenantId: string, referenceCode: string): Promise<Payment | null>;
  listByInvoice(invoiceId: string, tenantId: string): Promise<Payment[]>;
  /** Net of any `type: 'refund'` rows — payments minus refunds, not a plain sum. */
  sumByInvoice(invoiceId: string, tenantId: string): Promise<string>;
  create(tenantId: string, input: CreatePaymentInput, tx?: Db): Promise<Payment>;
}
