export interface LotTrace {
  lotId: string;
  tenantId: string;
  skuName: string;
  skuCategory: string | null;
  lotCode: string;
  sourceChannel: string | null;
  supplierName: string | null;
  receivedAt: Date;
  publishedAt: Date;
}

export interface PublishLotTraceInput {
  skuName: string;
  skuCategory: string | null;
  lotCode: string;
  sourceChannel: string | null;
  supplierName: string | null;
  receivedAt: Date;
}
