import type { Db } from '../../../../db/client';
import type { Return, CreateReturnInput } from '../return.types';

export const RETURN_REPOSITORY = Symbol('RETURN_REPOSITORY');

export interface CreateReturnRecordInput extends Pick<CreateReturnInput, 'reason' | 'refundMethod'> {
  orderId: string;
  invoiceId: string;
  refundAmount: string;
}

/**
 * `create` takes a REQUIRED `tx` — a return is never created standalone,
 * only as part of `ReturnService.returnOrder`'s one transaction spanning
 * stock credit, order/invoice status updates, the refund payment row, and
 * this insert together. Same mandatory-trailing-tx convention as
 * `IOrderRepository.create`/`InvoiceDrizzleRepository.create`.
 */
export interface IReturnRepository {
  findById(id: string, tenantId: string): Promise<Return | null>;
  listByTenant(tenantId: string): Promise<Return[]>;
  create(tenantId: string, input: CreateReturnRecordInput, tx: Db): Promise<Return>;
}
