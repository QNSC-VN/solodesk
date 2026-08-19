import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import {
  AuthService,
  EntraTokenVerifier,
  ENTRA_VERIFIER_OPTIONS,
  USER_REPOSITORY,
  AUTH_SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  CLAIMS_PROVIDER,
  AUDIT_SERVICE,
  AUTH_SERVICE_OPTIONS,
  type AuthServiceOptions,
  type EntraVerifierOptions,
} from '@qnsc-vn/identity';
import type { Env } from '../../config/env.schema';
import { IdentityTenantModule } from '../identity-tenant/identity-tenant.module';
import { PasswordService } from '../../platform/auth/password.service';
import { EmailService } from '../../platform/email.service';
import { GoogleTokenVerifier, GOOGLE_VERIFIER_OPTIONS, type GoogleVerifierOptions } from '../../platform/auth/google-token-verifier';
import { UserDrizzleRepository } from './infrastructure/persistence/user.drizzle-repository';
import { AuthSessionDrizzleRepository } from './infrastructure/persistence/auth-session.drizzle-repository';
import { AuthTransactionRunner } from './infrastructure/auth-transaction-runner';
import { TenantClaimsProvider } from './infrastructure/tenant-claims-provider';
import { AuthAuditService } from './infrastructure/auth-audit.service';
import { SessionMinter } from './application/session-minter';
import { SignupService } from './application/signup.service';
import { LoginService } from './application/login.service';
import { AuthController } from './api/auth.controller';
import { ACCESS_TOKEN_TTL } from './auth.constants';

/**
 * Binds @qnsc-vn/identity's real `AuthService` (refresh rotation, theft
 * detection, denylist — all reused unchanged) to real tables, and adds the
 * signup/login/Google/password-reset logic the package has no code for at
 * all. See CLAUDE.md's "Real login" section for the full design and why
 * this lives in SoloDesk's own repo, not the shared package.
 *
 * `IAccessService`/`IWorkspaceService`/`ISsoConnectionRepository`/
 * `ISsoProvisioningHook` are deliberately NOT bound — all four are
 * `@Optional()` in `AuthService`'s own constructor (verified against the
 * compiled package), and none are needed without a `switchWorkspace`
 * endpoint (explicitly deferred — see CLAUDE.md) or the package's own
 * connection-broker SSO flow (bypassed entirely — see `SignupService`).
 *
 * `EntraTokenVerifier` IS mandatory (not `@Optional()`) even though this
 * product never calls Entra — given placeholder options since it's never
 * actually invoked (only `ssoLogin`/`ssoLoginFromConnection` call it, and
 * this module never calls those).
 */
@Module({
  imports: [
    IdentityTenantModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => ({
        privateKey: config.get('JWT_PRIVATE_KEY', { infer: true })!,
        signOptions: {
          algorithm: 'ES256' as const,
          issuer: config.get('JWT_ISSUER', { infer: true })!,
          audience: config.get('JWT_AUDIENCE', { infer: true })!,
          expiresIn: ACCESS_TOKEN_TTL,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    EmailService,
    SessionMinter,
    SignupService,
    LoginService,
    // UserDrizzleRepository/AuthAuditService are ALSO injected by concrete
    // class directly (SignupService/LoginService need UserDrizzleRepository's
    // own findPasswordHashByEmail, not part of the port; SessionMinter
    // injects AuthAuditService directly) — `useExisting` shares ONE instance
    // between the class-typed injection and the token-typed one, same
    // pattern as platform/auth/auth.module.ts's AUTH_CONTEXT/REQUEST_CONTEXT
    // binding to a single RequestContextService instance.
    UserDrizzleRepository,
    { provide: USER_REPOSITORY, useExisting: UserDrizzleRepository },
    AuthAuditService,
    { provide: AUDIT_SERVICE, useExisting: AuthAuditService },
    { provide: AUTH_SESSION_REPOSITORY, useClass: AuthSessionDrizzleRepository },
    { provide: TRANSACTION_RUNNER, useClass: AuthTransactionRunner },
    { provide: CLAIMS_PROVIDER, useClass: TenantClaimsProvider },
    {
      provide: AUTH_SERVICE_OPTIONS,
      useFactory: (config: ConfigService<Env>): AuthServiceOptions => ({
        jwtAccessExpiry: ACCESS_TOKEN_TTL,
        jwtRefreshExpiry: '30d',
        platformAdminEmails: [],
        nodeEnv: config.get('NODE_ENV', { infer: true })!,
      }),
      inject: [ConfigService],
    },
    {
      provide: ENTRA_VERIFIER_OPTIONS,
      useValue: { tenantId: 'unused', clientId: 'unused' } satisfies EntraVerifierOptions,
    },
    EntraTokenVerifier,
    {
      provide: GOOGLE_VERIFIER_OPTIONS,
      useFactory: (config: ConfigService<Env>): GoogleVerifierOptions => ({
        clientId: config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true })!,
      }),
      inject: [ConfigService],
    },
    GoogleTokenVerifier,
  ],
})
export class AuthFeatureModule {}
