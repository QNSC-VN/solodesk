export type PaymentMethod = 'cash' | 'bank_transfer' | 'qr' | 'marketplace_settlement';
export type PaymentType = 'payment' | 'refund';

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  method: PaymentMethod;
  amount: string;
  type: PaymentType;
  referenceCode: string | null;
  receivedAt: Date;
}

export interface CreatePaymentInput {
  invoiceId: string;
  method: PaymentMethod;
  amount: string;
  /** Defaults to 'payment' — the returns module is the one caller that passes 'refund'. */
  type?: PaymentType;
  referenceCode?: string;
}

export interface PaymentSummary {
  invoiceId: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  isFullyPaid: boolean;
}
