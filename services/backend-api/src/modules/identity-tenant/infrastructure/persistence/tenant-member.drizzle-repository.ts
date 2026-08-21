import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { tenantMembers } from '../../../../db/schema/tenant-members';
import { userTenantMemberships } from '../../../../db/schema/user-tenant-memberships';
import { withTenantTransaction, withTenantTransactionOrReuse } from '../../../../platform/tenant-context';
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

  async listOwners(tenantId: string): Promise<TenantMember[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, 'owner')));
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

  async add(member: Omit<TenantMember, 'id'>, tx?: Db): Promise<TenantMember> {
    return withTenantTransactionOrReuse(db, member.tenantId, tx, async (innerTx) => {
      const rows = await innerTx.insert(tenantMembers).values(member).returning();
      // Maintains the non-RLS lookup index alongside the RLS-protected
      // source of truth, in the same transaction — see
      // `findTenantIdsForUser`'s doc comment on the port interface.
      await innerTx
        .insert(userTenantMemberships)
        .values({ userId: member.userId, tenantId: member.tenantId })
        .onConflictDoNothing();
      return toDomain(rows[0]!);
    });
  }

  /**
   * Reads the non-RLS `user_tenant_memberships` index directly — no
   * `withTenantTransaction` here on purpose, since the whole point is
   * answering this before any tenant context can exist.
   */
  async findTenantIdsForUser(userId: string): Promise<string[]> {
    const rows = await db
      .select({ tenantId: userTenantMemberships.tenantId })
      .from(userTenantMemberships)
      .where(eq(userTenantMemberships.userId, userId));
    return rows.map((r) => r.tenantId);
  }
}
