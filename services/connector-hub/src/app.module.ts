import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';
import { TenantContextInterceptor } from './platform/tenant-context.interceptor';
import { RequestContextMiddleware } from './platform/request-context.middleware';
import { AuthModule } from './platform/auth/auth.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    AuthModule,
    ConnectorsModule,
  ],
  providers: [
    // Global — same as backend-api: tenant scoping is not a per-route opt-in.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
