import type { Db } from '../../../../db/client';
import type { PurchaseNote, CreatePurchaseNoteInput } from '../procurement.types';

export const PURCHASE_NOTE_REPOSITORY = Symbol('PURCHASE_NOTE_REPOSITORY');

export interface ResolvedPurchaseNoteLine {
  skuId: string;
  lotId: string;
  quantity: string;
  unitCost: string;
  lineTotal: string;
}

export interface IPurchaseNoteRepository {
  findById(id: string, tenantId: string): Promise<PurchaseNote | null>;
  listByTenant(tenantId: string): Promise<PurchaseNote[]>;
  /** Resolved lines only (lot already received, cost already resolved by `PurchaseNoteService`) — REQUIRED `tx`, same convention as `IOrderRepository.create`. */
  create(tenantId: string, input: Pick<CreatePurchaseNoteInput, 'supplierId'>, lines: ResolvedPurchaseNoteLine[], tx: Db): Promise<PurchaseNote>;
  /** Narrow read for `traceability` — the supplier name (not the full record) that sourced a lot, or `null` if it wasn't received via a purchase note. */
  findSupplierNameByLotId(lotId: string, tenantId: string): Promise<string | null>;
}
