import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { LOT_REPOSITORY, type ILotRepository } from '../domain/ports/lot.repository';
import type { Lot, ReceiveLotInput, AvailableQuantity } from '../domain/inventory.types';

@Injectable()
export class InventoryService {
  constructor(@Inject(LOT_REPOSITORY) private readonly lotRepository: ILotRepository) {}

  async receiveLot(tenantId: string, input: ReceiveLotInput, createdBy?: string): Promise<Lot> {
    assertTenantMatchesSession(tenantId);
    return this.lotRepository.receive(tenantId, input, createdBy);
  }

  async getAvailableQuantity(skuId: string, tenantId: string): Promise<AvailableQuantity> {
    assertTenantMatchesSession(tenantId);
    return this.lotRepository.getAvailableQuantity(skuId, tenantId);
  }

  async reserve(lotId: string, tenantId: string, qty: string, referenceId?: string): Promise<Lot> {
    assertTenantMatchesSession(tenantId);
    const lot = await this.lotRepository.reserve(lotId, tenantId, qty, referenceId);
    if (!lot) {
      throw new ConflictException('INSUFFICIENT_STOCK', `Lot ${lotId} does not have ${qty} available to reserve.`);
    }
    return lot;
  }

  async release(lotId: string, tenantId: string, qty: string, referenceId?: string): Promise<Lot> {
    assertTenantMatchesSession(tenantId);
    const lot = await this.lotRepository.release(lotId, tenantId, qty, referenceId);
    if (!lot) {
      throw new ConflictException('RELEASE_EXCEEDS_RESERVED', `Lot ${lotId} does not have ${qty} reserved to release.`);
    }
    return lot;
  }

  async consumeReserved(lotId: string, tenantId: string, qty: string, referenceId?: string): Promise<Lot> {
    assertTenantMatchesSession(tenantId);
    const lot = await this.lotRepository.consumeReserved(lotId, tenantId, qty, referenceId);
    if (!lot) {
      throw new ConflictException('CONSUME_EXCEEDS_RESERVED', `Lot ${lotId} does not have ${qty} reserved to consume.`);
    }
    return lot;
  }

  /**
   * Direct counter sale, no prior reservation (bán tại quầy). This is the
   * exact operation Mục 11 names by risk: "hai đơn cùng tiêu 1 lô cuối" —
   * `LotDrizzleRepository.consumeDirect` is a single atomic guarded UPDATE,
   * so two concurrent calls against the same lot cannot both succeed past
   * what's actually available.
   */
  async consumeDirect(lotId: string, tenantId: string, qty: string, referenceId?: string): Promise<Lot> {
    assertTenantMatchesSession(tenantId);
    const lot = await this.lotRepository.consumeDirect(lotId, tenantId, qty, referenceId);
    if (!lot) {
      throw new ConflictException('INSUFFICIENT_STOCK', `Lot ${lotId} does not have ${qty} available to sell.`);
    }
    return lot;
  }

  /**
   * Sells `qty` of a SKU without the caller naming a specific lot — picks the
   * oldest available lot (FIFO). Scope limit, stated plainly: this only
   * consumes from ONE lot. If the single oldest lot has less than `qty`
   * available (even though the SKU's total across all lots would cover it),
   * this throws rather than silently splitting the sale across multiple
   * lots — that would need one transaction spanning several
   * `atomicUpdate` calls with compensation on partial failure, which is
   * genuinely more machinery than this module needs yet (YAGNI). Callers
   * that need a specific split call `consumeDirect` per lot themselves.
   */
  async sellFromSku(skuId: string, tenantId: string, qty: string, referenceId?: string): Promise<Lot> {
    assertTenantMatchesSession(tenantId);
    const [oldestLot] = await this.lotRepository.listAvailableBySku(skuId, tenantId);
    if (!oldestLot) {
      throw new NotFoundException('NO_AVAILABLE_LOT', `No lot with available stock for SKU ${skuId}.`);
    }
    return this.consumeDirect(oldestLot.id, tenantId, qty, referenceId);
  }
}
