export type OrderChannel = 'counter' | 'shopee' | 'tiktok_shop' | 'lazada' | 'phone' | 'other';
export type OrderStatus = 'confirmed' | 'cancelled';

export interface OrderLine {
  id: string;
  skuId: string;
  lotId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Order {
  id: string;
  tenantId: string;
  channel: OrderChannel;
  status: OrderStatus;
  customerName: string | null;
  totalAmount: string;
  createdAt: Date;
  lines: OrderLine[];
}

export interface CreateOrderLineInput {
  skuId: string;
  /** Explicit lot, or omit to let the service pick the oldest available lot (FIFO, single-lot only — same limit as InventoryService.sellFromSku). */
  lotId?: string;
  quantity: string;
  /** Snapshot price for this line. If omitted, the service reads the SKU's current price at order time and snapshots it. */
  unitPrice?: string;
}

export interface CreateOrderInput {
  channel: OrderChannel;
  customerName?: string;
  lines: CreateOrderLineInput[];
}
