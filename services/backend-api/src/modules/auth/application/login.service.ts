import { Injectable, Inject } from '@nestjs/common';
import { CacheService } from '@qnsc-vn/platform-cache';
import { RateLimitedException, UnauthorizedException } from '@qnsc-vn/platform-http';
import type { LoginResult } from '@qnsc-vn/identity';
import { PasswordService } from '../../../platform/auth/password.service';
import { UserDrizzleRepository } from '../infrastructure/persistence/user.drizzle-repository';
import {
  TENANT_MEMBER_REPOSITORY,
  type ITenantMemberRepository,
} from '../../identity-tenant/domain/ports/tenant.repository';
import { SessionMinter } from './session-minter';

const LOGIN_RATE_LIMIT = { limit: 5, windowSeconds: 15 * 60 };
const FORGOT_PASSWORD_RATE_LIMIT = { limit: 3, windowSeconds: 60 * 60 };
const SIGNUP_RATE_LIMIT = { limit: 10, windowSeconds: 60 * 60 };

/**
 * Rate limiting reuses `CacheService.consumeRateLimit` — already wired,
 * real infra (a Lua-script atomic sliding window on Valkey), not new
 * infrastructure. A non-technical, elderly-heavy user base is exactly the
 * audience password-guessing bots target hardest, so this isn't optional.
 */
@Injectable()
export class LoginService {
  constructor(
    private readonly userRepository: UserDrizzleRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionMinter: SessionMinter,
    private readonly cache: CacheService,
  ) {}

  async login(email: string, password: string, ipAddress?: string): Promise<LoginResult> {
    await this.checkRateLimit(`auth:login:${email}`, LOGIN_RATE_LIMIT);

    const found = await this.userRepository.findPasswordHashByEmail(email);
    const passwordOk = found?.passwordHash ? await this.passwordService.verify(found.passwordHash, password) : false;
    if (!found || !passwordOk) {
      throw new UnauthorizedException('INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    const { user } = found;
    if (!user.emailVerified) {
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED', 'Please verify your email before signing in.');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('ACCOUNT_NOT_ACTIVE', 'This account is not active.');
    }

    const [tenantId] = await this.memberRepository.findTenantIdsForUser(user.id);
    if (!tenantId) {
      throw new UnauthorizedException('NO_TENANT_MEMBERSHIP', 'This account has no business associated with it.');
    }

    return this.sessionMinter.mint(user, tenantId, 'password', ipAddress !== undefined ? { ipAddress } : {});
  }

  async checkForgotPasswordRateLimit(email: string): Promise<void> {
    await this.checkRateLimit(`auth:forgot-password:${email}`, FORGOT_PASSWORD_RATE_LIMIT);
  }

  async checkSignupRateLimit(ipAddress: string): Promise<void> {
    await this.checkRateLimit(`auth:signup:${ipAddress}`, SIGNUP_RATE_LIMIT);
  }

  private async checkRateLimit(key: string, opts: { limit: number; windowSeconds: number }): Promise<void> {
    const { allowed } = await this.cache.consumeRateLimit(key, opts.limit, opts.windowSeconds);
    if (!allowed) {
      throw new RateLimitedException('Too many attempts — please try again later.');
    }
  }
}
