import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { uuidv7 } from 'uuidv7';
import {
  signAccessToken,
  generateRefreshToken,
  parseTtlSeconds,
  USER_REPOSITORY,
  AUTH_SESSION_REPOSITORY,
  CLAIMS_PROVIDER,
  type IUserRepository,
  type IAuthSessionRepository,
  type IClaimsProvider,
  type User,
  type LoginResult,
} from '@qnsc-vn/identity';
import type { Db } from '../../../db/client';
import { AuthAuditService } from '../infrastructure/auth-audit.service';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../auth.constants';

/**
 * Mints a brand-new session for a user we've already authenticated
 * ourselves (password verified, or a Google id_token verified) — the one
 * piece @qnsc-vn/identity's `AuthService` doesn't expose publicly (its own
 * `createSession`/`toLoginResult` are private, reachable only through its
 * `ssoLogin`/`ssoLoginFromConnection`/`devLogin` entry points, none of which
 * fit self-serve tenant creation — see CLAUDE.md's "Real login" section).
 * Uses the exact same exported primitives + the SAME injected `JwtService`
 * AuthService itself uses internally (`this.jwt.sign(payload)`, verified
 * against the compiled package — no per-call algorithm/key options, meaning
 * JwtModule's own registered defaults ARE the signing config), so every
 * token minted here is byte-for-byte what the existing `JwtStrategy` already
 * verifies, and `AuthService.refresh`/`logout`/`logoutAll` work on these
 * sessions afterward exactly as if they'd been minted by the package itself.
 */
@Injectable()
export class SessionMinter {
  constructor(
    private readonly jwt: JwtService,
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository<Db>,
    @Inject(AUTH_SESSION_REPOSITORY) private readonly sessionRepository: IAuthSessionRepository<Db>,
    @Inject(CLAIMS_PROVIDER) private readonly claimsProvider: IClaimsProvider,
    private readonly auditService: AuthAuditService,
  ) {}

  async mint(
    user: User,
    tenantId: string | null,
    authMethod: 'password' | 'sso',
    options?: { ssoProvider?: string; ipAddress?: string; tx?: Db },
  ): Promise<LoginResult> {
    const sessionId = uuidv7();
    const { refreshToken, tokenHash, familyId } = generateRefreshToken();
    const csrfToken = randomBytes(24).toString('base64url');
    const claims = await this.claimsProvider.getClaims(user.id, tenantId);

    const { accessToken, expiresIn } = signAccessToken(
      (payload) => this.jwt.sign(payload),
      ACCESS_TOKEN_TTL,
      { userId: user.id, contextId: tenantId, sessionId, claims, authMethod },
    );

    const expiresAt = new Date(Date.now() + parseTtlSeconds(REFRESH_TOKEN_TTL, 30 * 24 * 3600) * 1000);

    await this.sessionRepository.create(
      {
        id: sessionId,
        contextId: tenantId,
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt,
        csrfToken,
        ...(options?.ipAddress !== undefined ? { ipAddress: options.ipAddress } : {}),
        ...(options?.ssoProvider ? { ssoProvider: options.ssoProvider } : {}),
      },
      options?.tx,
    );

    await this.userRepository.updateLastLogin(user.id, options?.tx);

    await this.auditService.record({
      workspaceId: tenantId ?? '',
      resourceType: 'session',
      resourceId: sessionId,
      actorId: user.id,
      actorEmail: user.email,
      action: authMethod === 'sso' ? 'login.sso' : 'login.password',
      ...(options?.ipAddress !== undefined ? { ipAddress: options.ipAddress } : {}),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        timezone: user.timezone,
      },
    };
  }
}
