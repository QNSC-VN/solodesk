import type { Supplier, CreateSupplierInput } from '../procurement.types';

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');

export interface ISupplierRepository {
  findById(id: string, tenantId: string): Promise<Supplier | null>;
  listByTenant(tenantId: string): Promise<Supplier[]>;
  create(tenantId: string, input: CreateSupplierInput): Promise<Supplier>;
}
