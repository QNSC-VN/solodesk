import type { LotTrace, PublishLotTraceInput } from '../trace.types';

export const LOT_TRACE_REPOSITORY = Symbol('LOT_TRACE_REPOSITORY');

export interface ILotTraceRepository {
  /** No `tenantId` param — this table has no RLS, and the public read has no tenant context (see `lot-traces.ts`'s header comment). */
  findByLotId(lotId: string): Promise<LotTrace | null>;
  /** Upsert — republishing the same lot updates its snapshot rather than erroring. */
  upsert(tenantId: string, lotId: string, input: PublishLotTraceInput): Promise<LotTrace>;
}
