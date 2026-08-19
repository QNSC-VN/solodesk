import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { resources } from '../../../../db/schema/resources';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IResourceRepository } from '../../domain/ports/resource.repository';
import type { Resource, CreateResourceInput } from '../../domain/booking.types';

function toDomain(row: typeof resources.$inferSelect): Resource {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    resourceType: row.resourceType,
    capacity: row.capacity,
    isActive: row.isActive,
  };
}

@Injectable()
export class ResourceDrizzleRepository implements IResourceRepository {
  async findById(id: string, tenantId: string): Promise<Resource | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(resources).where(and(eq(resources.id, id), eq(resources.tenantId, tenantId))).limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async listByTenant(tenantId: string): Promise<Resource[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(resources).where(eq(resources.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  async create(tenantId: string, input: CreateResourceInput): Promise<Resource> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(resources)
        .values({ tenantId, name: input.name, resourceType: input.resourceType, capacity: input.capacity })
        .returning();
      return toDomain(rows[0]!);
    });
  }
}
