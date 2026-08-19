export type PaymentMethod = 'cash' | 'bank_transfer' | 'qr' | 'marketplace_settlement';

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  method: PaymentMethod;
  amount: string;
  referenceCode: string | null;
  receivedAt: Date;
}

export interface CreatePaymentInput {
  invoiceId: string;
  method: PaymentMethod;
  amount: string;
  referenceCode?: string;
}

export interface PaymentSummary {
  invoiceId: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  isFullyPaid: boolean;
}
