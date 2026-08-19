import type { PaymentMethod } from '../../payment-reconcile/domain/payment.types';

export type ReturnStatus = 'completed';

export interface Return {
  id: string;
  tenantId: string;
  orderId: string;
  invoiceId: string;
  reason: string;
  refundAmount: string;
  refundMethod: PaymentMethod | null;
  status: ReturnStatus;
  createdAt: Date;
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  /** Required only when the invoice has a paid amount to refund back — see ReturnService.returnOrder. */
  refundMethod?: PaymentMethod;
}
