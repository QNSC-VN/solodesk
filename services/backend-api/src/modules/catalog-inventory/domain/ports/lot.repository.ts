import type { Db } from '../../../../db/client';
import type { Lot, ReceiveLotInput, AvailableQuantity } from '../inventory.types';

export const LOT_REPOSITORY = Symbol('LOT_REPOSITORY');

/**
 * Every mutating method here MUST be a single atomic `UPDATE ... WHERE
 * <guard> RETURNING *` — never a read-then-write from application code.
 * Postgres serializes concurrent UPDATEs on the same row via its row lock,
 * so the second of two concurrent callers re-evaluates the WHERE guard
 * against the first caller's already-applied change — this is what actually
 * prevents "hai đơn cùng tiêu lô cuối" (Mục 11), not a version column + retry
 * loop, which would be equivalent but more code for no extra safety here.
 *
 * A method returns `null` when the guard fails (insufficient available/
 * reserved quantity) — the caller decides whether that's a 409 Conflict.
 *
 * The optional trailing `tx` on every mutating method lets an
 * application-service span this call and another repository's write in ONE
 * transaction (e.g. `sales-order` — see `tenant-context.ts`'s
 * `withTenantTransactionOrReuse`). Omit it to run standalone, same as before.
 */
export interface ILotRepository {
  findById(id: string, tenantId: string): Promise<Lot | null>;
  /** Lots with available quantity > 0 for one SKU, oldest `receivedAt` first (FIFO consumption order). */
  listAvailableBySku(skuId: string, tenantId: string): Promise<Lot[]>;
  getAvailableQuantity(skuId: string, tenantId: string): Promise<AvailableQuantity>;
  /** Same aggregation, batched across every SKU in the tenant in one query — for the stock page/summary, not N+1 per-SKU calls. */
  listAvailableQuantitiesByTenant(tenantId: string): Promise<AvailableQuantity[]>;
  receive(tenantId: string, input: ReceiveLotInput, createdBy?: string, tx?: Db): Promise<Lot>;

  /** Holds `qty` against a lot for a pending order without deducting stock yet. */
  reserve(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null>;
  /** Releases a hold — order cancelled/expired before consumption. */
  release(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null>;
  /** Confirms a previously reserved amount as actually shipped/sold. */
  consumeReserved(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null>;
  /** Immediate sale with no prior reservation (counter sale, single channel). */
  consumeDirect(lotId: string, tenantId: string, qty: string, referenceId?: string, tx?: Db): Promise<Lot | null>;
}
