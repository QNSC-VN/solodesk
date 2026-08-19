import type { Sku, CreateSkuInput, UpdateSkuInput } from '../catalog.types';

export const SKU_REPOSITORY = Symbol('SKU_REPOSITORY');

export interface ISkuRepository {
  findById(id: string, tenantId: string): Promise<Sku | null>;
  findByCode(skuCode: string, tenantId: string): Promise<Sku | null>;
  listByTenant(tenantId: string): Promise<Sku[]>;
  create(tenantId: string, input: CreateSkuInput): Promise<Sku>;
  update(id: string, tenantId: string, input: UpdateSkuInput): Promise<Sku>;
}
