import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { IAuthSessionRepository, AuthSession, CreateSessionInput } from '@qnsc-vn/identity';
import { db, type Db } from '../../../../db/client';
import { authSessions } from '../../../../db/schema/auth-sessions';

function toDomain(row: typeof authSessions.$inferSelect): AuthSession {
  return {
    id: row.id,
    contextId: row.contextId,
    userId: row.userId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    isRevoked: row.isRevoked,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    ssoProvider: row.ssoProvider,
    csrfToken: row.csrfToken,
  };
}

/** Binds @qnsc-vn/identity's `IAuthSessionRepository` port to `identity.auth_sessions`. */
@Injectable()
export class AuthSessionDrizzleRepository implements IAuthSessionRepository<Db> {
  async findByTokenHash(hash: string): Promise<AuthSession | null> {
    const rows = await db.select().from(authSessions).where(eq(authSessions.tokenHash, hash)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async create(input: CreateSessionInput, tx?: Db): Promise<void> {
    await (tx ?? db).insert(authSessions).values({
      id: input.id,
      contextId: input.contextId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      expiresAt: input.expiresAt,
      ssoProvider: input.ssoProvider,
      csrfToken: input.csrfToken,
    });
  }

  async revokeById(id: string, tx?: Db): Promise<void> {
    await (tx ?? db).update(authSessions).set({ isRevoked: true }).where(eq(authSessions.id, id));
  }

  /**
   * Atomic flip false→true, guarded in the WHERE clause (same
   * atomicUpdate-style single-statement guard as `LotDrizzleRepository`) —
   * the CAS every concurrent refresh-rotation race depends on (see
   * @qnsc-vn/identity's own doc comment on this method). Only matches (and
   * returns a row) when it was still active; a concurrent winner's already-
   * committed revoke makes this a no-op that returns `false`.
   */
  async revokeByIdIfActive(id: string, tx?: Db): Promise<boolean> {
    const rows = await (tx ?? db)
      .update(authSessions)
      .set({ isRevoked: true })
      .where(and(eq(authSessions.id, id), eq(authSessions.isRevoked, false)))
      .returning();
    return rows.length > 0;
  }

  async revokeFamily(familyId: string, tx?: Db): Promise<void> {
    await (tx ?? db).update(authSessions).set({ isRevoked: true }).where(eq(authSessions.familyId, familyId));
  }

  async revokeAllForUser(userId: string, tx?: Db): Promise<void> {
    await (tx ?? db).update(authSessions).set({ isRevoked: true }).where(eq(authSessions.userId, userId));
  }
}
