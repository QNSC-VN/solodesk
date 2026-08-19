export type StockMovementType = 'receipt' | 'consumption' | 'adjustment' | 'reservation' | 'release';

export interface Lot {
  id: string;
  tenantId: string;
  skuId: string;
  lotCode: string;
  quantityOnHand: string;
  quantityReserved: string;
  sourceChannel: string | null;
  expiresAt: Date | null;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceiveLotInput {
  skuId: string;
  lotCode: string;
  quantity: string;
  sourceChannel?: string;
  expiresAt?: Date;
}

export interface AvailableQuantity {
  skuId: string;
  totalOnHand: string;
  totalReserved: string;
  totalAvailable: string; // onHand - reserved, across all lots
}

/** SKU catalog metadata + its aggregated stock quantity — the stock page's one combined view. */
export interface StockSummaryItem {
  skuId: string;
  skuCode: string;
  name: string;
  unit: string;
  category: string | null;
  unitPrice: string;
  isActive: boolean;
  totalOnHand: string;
  totalReserved: string;
  totalAvailable: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  lotId: string;
  movementType: StockMovementType;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string | null;
  createdAt: Date;
}
