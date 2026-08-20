import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ConflictException, UnauthorizedException } from '@qnsc-vn/platform-http';
import { hashToken, AUTH_SESSION_REPOSITORY, type IAuthSessionRepository, type LoginResult } from '@qnsc-vn/identity';
import { db, type Db } from '../../../db/client';
import { withTenantTransaction } from '../../../platform/tenant-context';
import { authTokens } from '../../../db/schema/auth-tokens';
import { users } from '../../../db/schema/users';
import { PasswordService } from '../../../platform/auth/password.service';
import { GoogleTokenVerifier } from '../../../platform/auth/google-token-verifier';
import { NotificationService } from '../../notifications/application/notification.service';
import { UserDrizzleRepository } from '../infrastructure/persistence/user.drizzle-repository';
import { SessionMinter } from './session-minter';
import {
  TENANT_REPOSITORY,
  TENANT_MEMBER_REPOSITORY,
  type ITenantRepository,
  type ITenantMemberRepository,
} from '../../identity-tenant/domain/ports/tenant.repository';
import type { TenantIndustry } from '../../identity-tenant/domain/tenant.types';

export interface SignupWithPasswordInput {
  email: string;
  password: string;
  legalName: string;
  industry: TenantIndustry;
  province?: string;
}

const EMAIL_VERIFY_TTL_MS = 24 * 3600 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function rawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Points at THIS service's own API route — no frontend page renders it, clicking the link just calls backend-api directly. */
function verifyEmailUrl(token: string): string {
  return `${process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'}/v1/auth/verify-email?token=${token}`;
}

/** Points at web-accounting's real `/reset-password` frontend page — a DIFFERENT origin than verifyEmailUrl's, deliberately not the same env var (see env.schema.ts's comment). */
function resetPasswordUrl(token: string): string {
  return `${process.env.WEB_ACCOUNTING_PUBLIC_URL ?? 'http://localhost:3010'}/reset-password?token=${token}`;
}

/**
 * Everything @qnsc-vn/identity has no code for: password hashing, signup
 * (which creates the tenant itself — the self-serve case its own SSO login
 * paths can't do), email verification, Google login/signup, password reset.
 * See CLAUDE.md's "Real login" section for the full reasoning.
 */
@Injectable()
export class SignupService {
  constructor(
    private readonly userRepository: UserDrizzleRepository,
    @Inject(AUTH_SESSION_REPOSITORY) private readonly sessionRepository: IAuthSessionRepository<Db>,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepository: ITenantRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository,
    private readonly passwordService: PasswordService,
    private readonly googleVerifier: GoogleTokenVerifier,
    private readonly notificationService: NotificationService,
    private readonly sessionMinter: SessionMinter,
  ) {}

  async signupWithPassword(input: SignupWithPasswordInput): Promise<void> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('EMAIL_ALREADY_REGISTERED', `An account with email ${input.email} already exists.`);
    }

    const passwordHash = await this.passwordService.hash(input.password);

    // tenants/users aren't RLS-scoped; tenant_members IS. Create the tenant
    // first (outside any tenant context, same as the existing
    // TenantController.createTenant path), then open ONE
    // withTenantTransaction scoped to that brand-new tenant's own id for
    // everything else — same "span two aggregates atomically" composition
    // as OrderService.placeOrder.
    const tenant = await this.tenantRepository.create({
      legalName: input.legalName,
      industry: input.industry,
      ...(input.province !== undefined ? { province: input.province } : {}),
    });

    await withTenantTransaction(db, tenant.id, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, displayName: input.legalName, emailVerified: false })
        .returning();

      await this.memberRepository.add(
        { tenantId: tenant.id, userId: user!.id, displayName: input.legalName, role: 'owner', canEdit: true },
        tx,
      );

      const token = rawToken();
      await tx.insert(authTokens).values({
        userId: user!.id,
        tenantId: tenant.id,
        tokenHash: hashToken(token),
        purpose: 'email_verify',
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      });

      await this.notificationService.notify(
        tenant.id,
        {
          userId: user!.id,
          type: 'EMAIL_VERIFY',
          title: 'Xác thực email của bạn',
          body: 'Vui lòng xác thực email để bắt đầu sử dụng SoloDesk.',
          sourceEventId: `email-verify-${user!.id}`,
          email: { templateName: 'EMAIL_VERIFY', vars: { verifyUrl: verifyEmailUrl(token) } },
        },
        tx,
      );
    });
  }

  async verifyEmail(token: string): Promise<LoginResult> {
    const tokenHash = hashToken(token);
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, 'email_verify')))
      .limit(1);

    const row = rows[0];
    if (!row || row.usedAt || row.expiresAt < new Date() || !row.tenantId) {
      throw new UnauthorizedException('INVALID_TOKEN', 'This link is invalid, already used, or expired.');
    }

    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, row.userId));

    const user = await this.userRepository.findById(row.userId);
    if (!user) throw new UnauthorizedException('INVALID_TOKEN', 'User no longer exists.');

    return this.sessionMinter.mint(user, row.tenantId, 'password');
  }

  async loginWithGoogle(idToken: string, ipAddress?: string): Promise<LoginResult> {
    const claims = await this.googleVerifier.verify(idToken);

    // Deliberately NOT one outer db.transaction() spanning every step: a
    // crash between tenant creation and the owner-membership insert would
    // leave an orphaned placeholder tenant, but that's the SAME accepted
    // trade-off signupWithPassword already has (tenant creation there isn't
    // inside its own transaction either — same "onboarding path" precedent
    // as the pre-existing TenantController.createTenant). What actually
    // matters here is correctness, not atomicity: `upsertBySsoIdentity`/
    // `memberRepository.add` each open their OWN properly-scoped
    // `withTenantTransaction` (which sets `SET LOCAL app.tenant_id` before
    // touching the RLS-protected `tenant_members` table) when called with
    // no `tx` — passing a plain `db.transaction()`'s `tx` down here instead
    // would silently skip that `SET LOCAL` (per `withTenantTransactionOrReuse`'s
    // own contract: reusing a `tx` assumes the CALLER already set tenant
    // context on it), and IS the exact bug this comment replaces — caught by
    // this method's own e2e test, not by reading the code.
    const user = await this.userRepository.upsertBySsoIdentity('google', claims.sub, claims.email, claims.displayName);

    const existingTenantIds = await this.memberRepository.findTenantIdsForUser(user.id);

    let tenantId: string;
    if (existingTenantIds[0]) {
      // A user with an `accountant_delegate`/`successor` membership in
      // more than one tenant just gets the first one here — real
      // multi-tenant switching is `switchWorkspace`, explicitly deferred
      // (see CLAUDE.md's "Real login" section).
      tenantId = existingTenantIds[0];
    } else {
      // Brand-new user via Google — the self-serve tenant-creation case
      // @qnsc-vn/identity's own ssoLoginFromConnection cannot express
      // (ProvisioningConnection.workspaceId is a single fixed id per
      // connection, not resolvable dynamically per login).
      const tenant = await this.tenantRepository.create({ legalName: claims.displayName, industry: 'food_beverage' });
      await this.memberRepository.add({ tenantId: tenant.id, userId: user.id, displayName: claims.displayName, role: 'owner', canEdit: true });
      tenantId = tenant.id;
    }

    return this.sessionMinter.mint(user, tenantId, 'sso', {
      ssoProvider: 'google',
      ...(ipAddress !== undefined ? { ipAddress } : {}),
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const found = await this.userRepository.findPasswordHashByEmail(email);
    if (!found || !found.passwordHash) {
      // No email-enumeration leak — always looks the same to the caller
      // whether or not the account (or a password on it) exists.
      return;
    }
    const { user } = found;

    const token = rawToken();
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    // No existing tx/tenant context here (unlike signup) — resolve the
    // user's tenant via the same non-RLS lookup Google-login's returning-user
    // case already uses, then open a fresh transaction for the notify call.
    const [tenantId] = await this.memberRepository.findTenantIdsForUser(user.id);
    if (tenantId) {
      await this.notificationService.notify(tenantId, {
        userId: user.id,
        type: 'PASSWORD_RESET',
        title: 'Yêu cầu đặt lại mật khẩu',
        body: 'Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
        sourceEventId: `password-reset-${token.slice(0, 16)}`,
        email: { templateName: 'PASSWORD_RESET', vars: { resetUrl: resetPasswordUrl(token) } },
      });
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, 'password_reset')))
      .limit(1);

    const row = rows[0];
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('INVALID_TOKEN', 'This link is invalid, already used, or expired.');
    }

    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));

    const passwordHash = await this.passwordService.hash(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));

    // A password reset invalidates every existing session — standard practice.
    await this.sessionRepository.revokeAllForUser(row.userId);
  }
}
