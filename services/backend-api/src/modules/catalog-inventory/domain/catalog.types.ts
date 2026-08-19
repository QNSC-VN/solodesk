export interface Sku {
  id: string;
  tenantId: string;
  skuCode: string;
  name: string;
  unit: string;
  category: string | null;
  unitPrice: string; // Drizzle returns numeric as string to preserve precision
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSkuInput {
  skuCode: string;
  name: string;
  unit: string;
  category?: string;
  unitPrice: string;
}

export interface UpdateSkuInput {
  name?: string;
  unit?: string;
  category?: string | null;
  unitPrice?: string;
  isActive?: boolean;
}
