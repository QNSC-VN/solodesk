import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { IUserRepository, User, SsoIdentity } from '@qnsc-vn/identity';
import { db, type Db } from '../../../../db/client';
import { users } from '../../../../db/schema/users';
import { ssoIdentities } from '../../../../db/schema/sso-identities';

function toDomain(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    status: row.status,
    emailVerified: row.emailVerified,
    locale: row.locale,
    timezone: row.timezone,
    phone: row.phone,
    sessionVersion: row.sessionVersion,
    lastLoginAt: row.lastLoginAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSsoDomain(row: typeof ssoIdentities.$inferSelect): SsoIdentity {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    providerSub: row.providerSub,
    providerEmail: row.providerEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * `identity.users` isn't RLS-scoped (same "global identity data" shape as
 * `identity.tenants`) — no `withTenantTransaction` here, matching
 * `TenantDrizzleRepository`. Binds `@qnsc-vn/identity`'s `IUserRepository`
 * port directly — see CLAUDE.md's "Real login" section.
 */
@Injectable()
export class UserDrizzleRepository implements IUserRepository<Db> {
  async findByEmail(email: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /**
   * `passwordHash` isn't part of `@qnsc-vn/identity`'s `User` domain type
   * (it's this product's own column, not a shared-package concern) — a
   * separate method on the concrete class, injected directly by
   * `LoginService`/`SignupService` alongside the `USER_REPOSITORY` token,
   * rather than widening the port interface for one product-specific field.
   */
  async findPasswordHashByEmail(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const row = rows[0];
    return row ? { user: toDomain(row), passwordHash: row.passwordHash } : null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async updateLastLogin(id: string, tx?: Db): Promise<void> {
    await (tx ?? db)
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updateStatus(id: string, status: string, tx?: Db): Promise<void> {
    await (tx ?? db)
      .update(users)
      .set({ status: status as User['status'], updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updateProfile(
    id: string,
    input: { displayName?: string; avatarUrl?: string | null; locale?: string; timezone?: string; phone?: string | null },
  ): Promise<User> {
    const rows = await db
      .update(users)
      .set({
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return toDomain(rows[0]!);
  }

  async findSsoIdentity(provider: string, providerSub: string): Promise<SsoIdentity | null> {
    const rows = await db
      .select()
      .from(ssoIdentities)
      .where(and(eq(ssoIdentities.provider, provider), eq(ssoIdentities.providerSub, providerSub)))
      .limit(1);
    return rows[0] ? toSsoDomain(rows[0]) : null;
  }

  /**
   * Find-or-create user by email, then link the provider identity — the
   * same shape whether this is a brand-new signup or a returning user who
   * originally signed up with a password (natural account linking by email).
   * Runs in the caller's transaction when one is provided so a concurrent
   * duplicate login is safe.
   */
  async upsertBySsoIdentity(provider: string, providerSub: string, providerEmail: string, displayName: string, tx?: Db): Promise<User> {
    const conn = tx ?? db;

    const existingIdentity = await conn
      .select()
      .from(ssoIdentities)
      .where(and(eq(ssoIdentities.provider, provider), eq(ssoIdentities.providerSub, providerSub)))
      .limit(1);
    if (existingIdentity[0]) {
      const userRows = await conn.select().from(users).where(eq(users.id, existingIdentity[0].userId)).limit(1);
      return toDomain(userRows[0]!);
    }

    const existingUser = await conn.select().from(users).where(eq(users.email, providerEmail)).limit(1);
    const user = existingUser[0]
      ? existingUser[0].emailVerified
        ? existingUser[0]
        : // Linking Google to a pre-existing (e.g. password-signup, not yet
          // verified) account is itself real proof of email ownership.
          (await conn.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, existingUser[0].id)).returning())[0]!
      : (
          await conn
            .insert(users)
            .values({ email: providerEmail, displayName, emailVerified: true })
            .returning()
        )[0]!;

    await conn.insert(ssoIdentities).values({
      userId: user.id,
      provider,
      providerSub,
      providerEmail,
    });

    return toDomain(user);
  }
}
