import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { tenants } from '../../../../db/schema/tenants';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { ITenantRepository } from '../../domain/ports/tenant.repository';
import type { Tenant, CreateTenantInput, UpdateTenantProfileInput } from '../../domain/tenant.types';

function toDomain(row: typeof tenants.$inferSelect): Tenant {
  return {
    id: row.id,
    legalName: row.legalName,
    industry: row.industry as Tenant['industry'],
    province: row.province,
    activatedAt: row.activatedAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * NOT tenant-scoped by RLS (see 0001_init_identity_schema.sql comment) — this
 * is the one repository in the codebase that legitimately runs outside
 * `withTenantTransaction`, because it operates on the tenant list itself.
 */
@Injectable()
export class TenantDrizzleRepository implements ITenantRepository {
  async findById(id: string): Promise<Tenant | null> {
    const rows = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async create(input: CreateTenantInput): Promise<Tenant> {
    const rows = await db
      .insert(tenants)
      .values({
        legalName: input.legalName,
        industry: input.industry,
        province: input.province ?? 'gia_lai',
      })
      .returning();
    return toDomain(rows[0]!);
  }

  async activate(id: string): Promise<Tenant> {
    const rows = await db
      .update(tenants)
      .set({ activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return toDomain(rows[0]!);
  }

  async updateProfile(id: string, input: UpdateTenantProfileInput): Promise<Tenant> {
    const rows = await db
      .update(tenants)
      .set({
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.industry !== undefined ? { industry: input.industry } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();
    return toDomain(rows[0]!);
  }
}
