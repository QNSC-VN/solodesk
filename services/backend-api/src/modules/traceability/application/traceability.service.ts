import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { LOT_TRACE_REPOSITORY, type ILotTraceRepository } from '../domain/ports/lot-trace.repository';
import { LOT_REPOSITORY } from '../../catalog-inventory/domain/ports/lot.repository';
import type { ILotRepository } from '../../catalog-inventory/domain/ports/lot.repository';
import { SKU_REPOSITORY } from '../../catalog-inventory/domain/ports/sku.repository';
import type { ISkuRepository } from '../../catalog-inventory/domain/ports/sku.repository';
import { PURCHASE_NOTE_REPOSITORY } from '../../procurement/domain/ports/purchase-note.repository';
import type { IPurchaseNoteRepository } from '../../procurement/domain/ports/purchase-note.repository';
import type { LotTrace } from '../domain/trace.types';

/**
 * `publishLotTrace` is the ONLY way a row reaches `traceability.lot_traces`
 * — receiving stock never does this automatically (see that table's header
 * comment). It reads the lot/SKU/supplier through the same tenant-scoped,
 * RLS-protected repositories every other module uses; `lotRepository
 * .findById(lotId, tenantId)` returning non-null IS the ownership proof
 * that the caller's tenant actually owns this lot, before anything about
 * it becomes publicly readable.
 */
@Injectable()
export class TraceabilityService {
  constructor(
    @Inject(LOT_TRACE_REPOSITORY) private readonly lotTraceRepository: ILotTraceRepository,
    @Inject(LOT_REPOSITORY) private readonly lotRepository: ILotRepository,
    @Inject(SKU_REPOSITORY) private readonly skuRepository: ISkuRepository,
    @Inject(PURCHASE_NOTE_REPOSITORY) private readonly purchaseNoteRepository: IPurchaseNoteRepository,
  ) {}

  async publishLotTrace(tenantId: string, lotId: string): Promise<LotTrace> {
    assertTenantMatchesSession(tenantId);

    const lot = await this.lotRepository.findById(lotId, tenantId);
    if (!lot) {
      throw new NotFoundException('LOT_NOT_FOUND', `Lot ${lotId} not found`);
    }
    const sku = await this.skuRepository.findById(lot.skuId, tenantId);
    if (!sku) {
      throw new NotFoundException('SKU_NOT_FOUND', `SKU ${lot.skuId} not found`);
    }
    const supplierName = await this.purchaseNoteRepository.findSupplierNameByLotId(lotId, tenantId);

    return this.lotTraceRepository.upsert(tenantId, lotId, {
      skuName: sku.name,
      skuCategory: sku.category,
      lotCode: lot.lotCode,
      sourceChannel: lot.sourceChannel,
      supplierName,
      receivedAt: lot.receivedAt,
    });
  }

  /** Public path — no tenant context, no `assertTenantMatchesSession`. Only ever reads the pre-published, RLS-free projection. */
  async getPublicTrace(lotId: string): Promise<LotTrace> {
    const trace = await this.lotTraceRepository.findByLotId(lotId);
    if (!trace) {
      throw new NotFoundException('TRACE_NOT_PUBLISHED', `Lot ${lotId} has no published trace.`);
    }
    return trace;
  }
}
