import { Inject, Injectable } from '@nestjs/common';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { NEGOTIATED_PRICE_REPOSITORY, type INegotiatedPriceRepository } from '../domain/ports/negotiated-price.repository';
import { SupplierService } from './supplier.service';
import { CatalogService } from '../../catalog-inventory/application/catalog.service';
import type { NegotiatedPrice } from '../domain/procurement.types';

/**
 * Section 20.5's Strategy/versioning discipline applied to procurement:
 * "per-supplier negotiated pricing" changes over time, and a past purchase
 * note must keep whatever `unit_cost` it actually snapshotted even after a
 * new rate is set here — see `negotiated-price.drizzle-repository.ts`'s
 * `setActive` for the atomic close-old/insert-new mechanics.
 */
@Injectable()
export class NegotiatedPriceService {
  constructor(
    @Inject(NEGOTIATED_PRICE_REPOSITORY) private readonly negotiatedPriceRepository: INegotiatedPriceRepository,
    private readonly supplierService: SupplierService,
    private readonly catalogService: CatalogService,
  ) {}

  async setPrice(tenantId: string, supplierId: string, skuId: string, unitCost: string, effectiveFrom: Date = new Date()): Promise<NegotiatedPrice> {
    assertTenantMatchesSession(tenantId);
    await this.supplierService.getSupplier(supplierId, tenantId); // 404s if missing/cross-tenant
    await this.catalogService.getSku(skuId, tenantId); // 404s if missing/cross-tenant
    return this.negotiatedPriceRepository.setActive(tenantId, supplierId, skuId, unitCost, effectiveFrom);
  }

  async getActivePrice(tenantId: string, supplierId: string, skuId: string, asOf: Date = new Date()): Promise<NegotiatedPrice | null> {
    assertTenantMatchesSession(tenantId);
    return this.negotiatedPriceRepository.findActive(tenantId, supplierId, skuId, asOf);
  }
}
