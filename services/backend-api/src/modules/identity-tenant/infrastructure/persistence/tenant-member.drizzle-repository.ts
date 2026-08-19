import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { tenantMembers } from '../../../../db/schema/tenant-members';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { ITenantMemberRepository } from '../../domain/ports/tenant.repository';
import type { TenantMember } from '../../domain/tenant.types';

function toDomain(row: typeof tenantMembers.$inferSelect): TenantMember {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
    canEdit: row.canEdit,
  };
}

/**
 * Reference implementation every future domain-module repository copies:
 * every query wrapped in `withTenantTransaction`, so `SET LOCAL app.tenant_id`
 * is guaranteed set before RLS ever evaluates a row on this table — the
 * `tenant_id = ...` filter in every query below is redundant with RLS on
 * purpose (defense in depth), never a substitute for it.
 */
@Injectable()
export class TenantMemberDrizzleRepository implements ITenantMemberRepository {
  async listByTenant(tenantId: string): Promise<TenantMember[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
      return rows.map(toDomain);
    });
  }

  async findByUserId(tenantId: string, userId: string): Promise<TenantMember | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async add(member: Omit<TenantMember, 'id'>): Promise<TenantMember> {
    return withTenantTransaction(db, member.tenantId, async (tx) => {
      const rows = await tx.insert(tenantMembers).values(member).returning();
      return toDomain(rows[0]!);
    });
  }
}
