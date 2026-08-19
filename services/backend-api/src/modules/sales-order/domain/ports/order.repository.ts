import type { Db } from '../../../../db/client';
import type { Order, CreateOrderInput } from '../order.types';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

/**
 * `create` takes resolved lines (lot already picked, price already snapshotted
 * by `OrderService` — the repository never decides business rules, only
 * persists) plus a REQUIRED `tx`: an order is never created standalone, only
 * as part of `OrderService.placeOrder`'s one transaction spanning the order
 * insert AND the stock consumption together (Section: why `ILotRepository`
 * grew an optional `tx` param — see `tenant-context.ts`).
 */
export interface ResolvedOrderLine {
  skuId: string;
  lotId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface IOrderRepository {
  findById(id: string, tenantId: string): Promise<Order | null>;
  listByTenant(tenantId: string): Promise<Order[]>;
  create(
    tenantId: string,
    input: Pick<CreateOrderInput, 'channel' | 'customerName'>,
    lines: ResolvedOrderLine[],
    tx: Db,
  ): Promise<Order>;
}
