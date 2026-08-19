import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';
import { TenantContextInterceptor } from './platform/tenant-context.interceptor';
import { RequestContextMiddleware } from './platform/request-context.middleware';
import { AuthModule } from './platform/auth/auth.module';
import { IdentityTenantModule } from './modules/identity-tenant/identity-tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    AuthModule,
    IdentityTenantModule,
  ],
  providers: [
    // Global — tenant scoping is not a per-route opt-in (Section 4.1).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Must run before Guards (Nest order: Middleware → Guards → Interceptors),
    // so GlobalJwtAuthGuard's setAuthContext() has an already-entered
    // RequestContextService store to mutate into.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
