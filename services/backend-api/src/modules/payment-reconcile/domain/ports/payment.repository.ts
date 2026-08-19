import type { Payment, CreatePaymentInput } from '../payment.types';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface IPaymentRepository {
  findByReferenceCode(tenantId: string, referenceCode: string): Promise<Payment | null>;
  listByInvoice(invoiceId: string, tenantId: string): Promise<Payment[]>;
  sumByInvoice(invoiceId: string, tenantId: string): Promise<string>;
  create(tenantId: string, input: CreatePaymentInput): Promise<Payment>;
}
