import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { CacheModule } from '@qnsc-vn/platform-cache';
import { JwtStrategy, JwtAuthGuard, AuthTokenCache, AUTH_CONTEXT, JWT_STRATEGY_OPTIONS, type JwtStrategyOptions } from '@qnsc-vn/identity';
import { RequestContextService, REQUEST_CONTEXT, GlobalExceptionFilter } from '@qnsc-vn/platform-http';
import type { Env } from '../../config/env.schema';
import { GlobalJwtAuthGuard } from './global-jwt-auth.guard';

/** Same shape as backend-api/connector-hub's `auth.module.ts` — see either's header comment for the full rationale. */
@Global()
@Module({
  imports: [
    PassportModule,
    CacheModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => ({
        url: config.get('REDIS_URL', { infer: true })!,
        keyPrefix: config.get('REDIS_KEY_PREFIX', { infer: true })!,
        mode: 'required',
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    AuthTokenCache,
    JwtAuthGuard,
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
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [RequestContextService],
})
export class AuthModule {}
