import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { SUPPLIER_REPOSITORY, type ISupplierRepository } from '../domain/ports/supplier.repository';
import type { Supplier, CreateSupplierInput } from '../domain/procurement.types';

@Injectable()
export class SupplierService {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly supplierRepository: ISupplierRepository) {}

  async createSupplier(tenantId: string, input: CreateSupplierInput): Promise<Supplier> {
    assertTenantMatchesSession(tenantId);
    return this.supplierRepository.create(tenantId, input);
  }

  async getSupplier(id: string, tenantId: string): Promise<Supplier> {
    assertTenantMatchesSession(tenantId);
    const supplier = await this.supplierRepository.findById(id, tenantId);
    if (!supplier) {
      throw new NotFoundException('SUPPLIER_NOT_FOUND', `Supplier ${id} not found`);
    }
    return supplier;
  }

  async listSuppliers(tenantId: string): Promise<Supplier[]> {
    assertTenantMatchesSession(tenantId);
    return this.supplierRepository.listByTenant(tenantId);
  }
}
