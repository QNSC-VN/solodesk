import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { SKU_REPOSITORY, type ISkuRepository } from '../domain/ports/sku.repository';
import type { Sku, CreateSkuInput, UpdateSkuInput } from '../domain/catalog.types';

@Injectable()
export class CatalogService {
  constructor(@Inject(SKU_REPOSITORY) private readonly skuRepository: ISkuRepository) {}

  async createSku(tenantId: string, input: CreateSkuInput): Promise<Sku> {
    assertTenantMatchesSession(tenantId);
    const existing = await this.skuRepository.findByCode(input.skuCode, tenantId);
    if (existing) {
      throw new ConflictException('SKU_CODE_TAKEN', `A SKU with code "${input.skuCode}" already exists.`);
    }
    return this.skuRepository.create(tenantId, input);
  }

  async getSku(id: string, tenantId: string): Promise<Sku> {
    assertTenantMatchesSession(tenantId);
    const sku = await this.skuRepository.findById(id, tenantId);
    if (!sku) {
      throw new NotFoundException('SKU_NOT_FOUND', `SKU ${id} not found`);
    }
    return sku;
  }

  async listSkus(tenantId: string): Promise<Sku[]> {
    assertTenantMatchesSession(tenantId);
    return this.skuRepository.listByTenant(tenantId);
  }

  async updateSku(id: string, tenantId: string, input: UpdateSkuInput): Promise<Sku> {
    assertTenantMatchesSession(tenantId);
    await this.getSku(id, tenantId); // 404s if missing/cross-tenant before attempting the update
    return this.skuRepository.update(id, tenantId, input);
  }
}
