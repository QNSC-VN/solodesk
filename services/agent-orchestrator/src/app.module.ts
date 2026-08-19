import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';
import { RequestContextMiddleware } from './platform/request-context.middleware';
import { AuthModule } from './platform/auth/auth.module';
import { ConversationsModule } from './modules/conversations/conversations.module';

/**
 * No `TenantContextInterceptor`/ALS tenant scoping here (unlike backend-api/
 * connector-hub) — this app has no repository layer reading an ambient
 * tenant context; `@CurrentTenant()` reads `request.user.contextId`
 * directly per-request, and every downstream call passes `tenantId` as an
 * explicit argument all the way into the Temporal workflow/Activity. See
 * `platform/tenant-db.ts`'s header comment for the full reasoning.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), AuthModule, ConversationsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
