import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { suppliers } from '../../../../db/schema/suppliers';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { ISupplierRepository } from '../../domain/ports/supplier.repository';
import type { Supplier, CreateSupplierInput } from '../../domain/procurement.types';

function toDomain(row: typeof suppliers.$inferSelect): Supplier {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    contactInfo: row.contactInfo,
    taxCode: row.taxCode,
    isActive: row.isActive,
  };
}

@Injectable()
export class SupplierDrizzleRepository implements ISupplierRepository {
  async findById(id: string, tenantId: string): Promise<Supplier | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<Supplier[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(suppliers).where(eq(suppliers.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  async create(tenantId: string, input: CreateSupplierInput): Promise<Supplier> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(suppliers)
        .values({ tenantId, name: input.name, contactInfo: input.contactInfo ?? null, taxCode: input.taxCode ?? null })
        .returning();
      return toDomain(rows[0]!);
    });
  }
}
