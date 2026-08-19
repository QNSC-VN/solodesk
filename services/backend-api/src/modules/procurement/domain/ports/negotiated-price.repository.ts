import type { NegotiatedPrice } from '../procurement.types';

export const NEGOTIATED_PRICE_REPOSITORY = Symbol('NEGOTIATED_PRICE_REPOSITORY');

export interface INegotiatedPriceRepository {
  findActive(tenantId: string, supplierId: string, skuId: string, asOf: Date): Promise<NegotiatedPrice | null>;
  /** Closes any currently-active row for this supplier+SKU (sets its `effectiveTo`) and inserts the new one, atomically. */
  setActive(tenantId: string, supplierId: string, skuId: string, unitCost: string, effectiveFrom: Date): Promise<NegotiatedPrice>;
}
