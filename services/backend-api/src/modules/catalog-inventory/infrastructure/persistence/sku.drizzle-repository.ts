import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { skus } from '../../../../db/schema/skus';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { ISkuRepository } from '../../domain/ports/sku.repository';
import type { Sku, CreateSkuInput, UpdateSkuInput } from '../../domain/catalog.types';

function toDomain(row: typeof skus.$inferSelect): Sku {
  return {
    id: row.id,
    tenantId: row.tenantId,
    skuCode: row.skuCode,
    name: row.name,
    unit: row.unit,
    category: row.category,
    unitPrice: row.unitPrice,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class SkuDrizzleRepository implements ISkuRepository {
  async findById(id: string, tenantId: string): Promise<Sku | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(skus).where(and(eq(skus.id, id), eq(skus.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async findByCode(skuCode: string, tenantId: string): Promise<Sku | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(skus)
        .where(and(eq(skus.skuCode, skuCode), eq(skus.tenantId, tenantId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<Sku[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(skus).where(eq(skus.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  async create(tenantId: string, input: CreateSkuInput): Promise<Sku> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(skus)
        .values({
          tenantId,
          skuCode: input.skuCode,
          name: input.name,
          unit: input.unit,
          category: input.category ?? null,
          unitPrice: input.unitPrice,
        })
        .returning();
      return toDomain(rows[0]!);
    });
  }

  async update(id: string, tenantId: string, input: UpdateSkuInput): Promise<Sku> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(skus)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(skus.id, id), eq(skus.tenantId, tenantId)))
        .returning();
      return toDomain(rows[0]!);
    });
  }
}
