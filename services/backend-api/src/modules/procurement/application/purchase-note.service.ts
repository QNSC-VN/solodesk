import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { db } from '../../../db/client';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { multiplyMoney } from '../../../platform/money';
import { PURCHASE_NOTE_REPOSITORY, type IPurchaseNoteRepository, type ResolvedPurchaseNoteLine } from '../domain/ports/purchase-note.repository';
import { NEGOTIATED_PRICE_REPOSITORY, type INegotiatedPriceRepository } from '../domain/ports/negotiated-price.repository';
import { SupplierService } from './supplier.service';
import { LOT_REPOSITORY } from '../../catalog-inventory/domain/ports/lot.repository';
import type { ILotRepository } from '../../catalog-inventory/domain/ports/lot.repository';
import { SKU_REPOSITORY } from '../../catalog-inventory/domain/ports/sku.repository';
import type { ISkuRepository } from '../../catalog-inventory/domain/ports/sku.repository';
import type { PurchaseNote, CreatePurchaseNoteInput } from '../domain/procurement.types';

/**
 * `recordPurchase` is procurement's mirror of `OrderService.placeOrder`:
 * one transaction spanning the purchase note AND the stock receipt for
 * every line, so a failed note insert can never leave inventory received
 * with nothing recorded (or vice versa). `LOT_REPOSITORY`/`SKU_REPOSITORY`
 * injected directly, same repository-to-repository composition rationale
 * as `sales-order` (see its header comment) — `receive()` grew an optional
 * trailing `tx` for exactly this.
 */
@Injectable()
export class PurchaseNoteService {
  constructor(
    @Inject(PURCHASE_NOTE_REPOSITORY) private readonly purchaseNoteRepository: IPurchaseNoteRepository,
    @Inject(NEGOTIATED_PRICE_REPOSITORY) private readonly negotiatedPriceRepository: INegotiatedPriceRepository,
    @Inject(LOT_REPOSITORY) private readonly lotRepository: ILotRepository,
    @Inject(SKU_REPOSITORY) private readonly skuRepository: ISkuRepository,
    private readonly supplierService: SupplierService,
  ) {}

  async recordPurchase(tenantId: string, idempotencyKey: string, input: CreatePurchaseNoteInput): Promise<PurchaseNote> {
    assertTenantMatchesSession(tenantId);
    await this.supplierService.getSupplier(input.supplierId, tenantId); // 404s if missing/cross-tenant

    return withTenantTransaction(db, tenantId, (tx) =>
      withIdempotency(tx, tenantId, idempotencyKey, async () => {
        const resolvedLines: ResolvedPurchaseNoteLine[] = [];

        for (const line of input.lines) {
          const sku = await this.skuRepository.findById(line.skuId, tenantId);
          if (!sku) {
            throw new NotFoundException('SKU_NOT_FOUND', `SKU ${line.skuId} not found`);
          }

          let unitCost = line.unitCost;
          if (!unitCost) {
            const negotiated = await this.negotiatedPriceRepository.findActive(tenantId, input.supplierId, line.skuId, new Date());
            if (!negotiated) {
              throw new ConflictException(
                'NO_NEGOTIATED_PRICE',
                `No active negotiated price for supplier ${input.supplierId} and SKU ${line.skuId} — pass an explicit unitCost or set one first.`,
              );
            }
            unitCost = negotiated.unitCost;
          }

          const lot = await this.lotRepository.receive(tenantId, { skuId: line.skuId, lotCode: line.lotCode, quantity: line.quantity, sourceChannel: 'purchase_note' }, undefined, tx);
          const lineTotal = multiplyMoney(unitCost, line.quantity);
          resolvedLines.push({ skuId: line.skuId, lotId: lot.id, quantity: line.quantity, unitCost, lineTotal });
        }

        return this.purchaseNoteRepository.create(tenantId, { supplierId: input.supplierId }, resolvedLines, tx);
      }),
    );
  }

  async getPurchaseNote(id: string, tenantId: string): Promise<PurchaseNote> {
    assertTenantMatchesSession(tenantId);
    const note = await this.purchaseNoteRepository.findById(id, tenantId);
    if (!note) {
      throw new NotFoundException('PURCHASE_NOTE_NOT_FOUND', `Purchase note ${id} not found`);
    }
    return note;
  }

  async listPurchaseNotes(tenantId: string): Promise<PurchaseNote[]> {
    assertTenantMatchesSession(tenantId);
    return this.purchaseNoteRepository.listByTenant(tenantId);
  }
}
