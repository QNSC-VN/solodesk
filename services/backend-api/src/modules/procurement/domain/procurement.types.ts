export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactInfo: string | null;
  taxCode: string | null;
  isActive: boolean;
}

export interface CreateSupplierInput {
  name: string;
  contactInfo?: string;
  taxCode?: string;
}

export interface NegotiatedPrice {
  id: string;
  supplierId: string;
  skuId: string;
  unitCost: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface PurchaseNoteLine {
  id: string;
  skuId: string;
  lotId: string;
  quantity: string;
  unitCost: string;
  lineTotal: string;
}

export type PurchaseNoteStatus = 'recorded' | 'cancelled';

export interface PurchaseNote {
  id: string;
  tenantId: string;
  supplierId: string;
  status: PurchaseNoteStatus;
  totalAmount: string;
  createdAt: Date;
  lines: PurchaseNoteLine[];
}

export interface CreatePurchaseNoteLineInput {
  skuId: string;
  lotCode: string;
  quantity: string;
  /** Overrides the active negotiated price for this supplier+SKU. If omitted, one must exist or the purchase is rejected. */
  unitCost?: string;
}

export interface CreatePurchaseNoteInput {
  supplierId: string;
  lines: CreatePurchaseNoteLineInput[];
}
