import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { CacheModule } from '@qnsc-vn/platform-cache';
import { JwtStrategy, JwtAuthGuard, AuthTokenCache, AUTH_CONTEXT, JWT_STRATEGY_OPTIONS, type JwtStrategyOptions } from '@qnsc-vn/identity';
import { RequestContextService, REQUEST_CONTEXT, GlobalExceptionFilter } from '@qnsc-vn/platform-http';
import type { Env } from '../../config/env.schema';
import { GlobalJwtAuthGuard } from './global-jwt-auth.guard';

/**
 * Wires token VERIFICATION only (Bearer JWT → `request.user`), reusing
 * `@qnsc-vn/identity`'s real mechanism unchanged (Section 17.4 principle:
 * depend on shared packages directly, don't re-derive them). Deliberately
 * does NOT wire the package's login/SSO/refresh-rotation `AuthService` —
 * that needs `USER_REPOSITORY`/`AUTH_SESSION_REPOSITORY`/`CLAIMS_PROVIDER`/
 * `AUDIT_SERVICE` bound to real tables that don't exist in this repo yet.
 * That's separate, larger Sprint 1+ scope: tokens for local dev/testing are
 * minted by `scripts/mint-dev-token.ts` against `DEV_JWT_PRIVATE_KEY`, never
 * by a real login endpoint, until that work lands.
 */
@Global()
@Module({
  imports: [
    PassportModule,
    CacheModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => ({
        url: config.get('REDIS_URL', { infer: true })!,
        keyPrefix: config.get('REDIS_KEY_PREFIX', { infer: true })!,
        mode: 'required', // denylist checks must fail loud, not silently pass everyone
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    AuthTokenCache,
    JwtAuthGuard,
    // One RequestContextService instance backs both DI tokens — its own doc
    // comment says it "structurally satisfies both" AUTH_CONTEXT (identity)
    // and REQUEST_CONTEXT (this GlobalExceptionFilter). Entered per-request
    // by RequestContextMiddleware (src/platform/request-context.middleware.ts),
    // which must run before this guard for setAuthContext to have anything
    // to mutate into.
    RequestContextService,
    { provide: AUTH_CONTEXT, useExisting: RequestContextService },
    { provide: REQUEST_CONTEXT, useExisting: RequestContextService },
    {
      provide: JWT_STRATEGY_OPTIONS,
      useFactory: (config: ConfigService<Env>): JwtStrategyOptions => ({
        publicKey: config.get('JWT_PUBLIC_KEY', { infer: true })!,
        issuer: config.get('JWT_ISSUER', { infer: true })!,
        audience: config.get('JWT_AUDIENCE', { infer: true })!,
      }),
      inject: [ConfigService],
    },
    { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
    // Registered here (not app.module.ts) so it ships with the rest of the
    // request-context wiring it depends on, in one place.
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  // AuthTokenCache exported (in addition to RequestContextService) so the
  // real-login module's own binding of @qnsc-vn/identity's AuthService can
  // reuse this SAME instance/Redis connection rather than opening a second
  // one — @Global() means this propagates everywhere without a re-import.
  exports: [RequestContextService, AuthTokenCache],
})
export class AuthModule {}
