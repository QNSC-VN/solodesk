// MUST be the first import. `AppModule`'s import graph pulls in
// `db/client.ts`, which reads `process.env.DATABASE_URL` at module-load time —
// before Nest even starts, since Node resolves `import`s eagerly. Nest's own
// `ConfigModule.forRoot()` loads `.env` too late to matter here; it only helps
// code that reads `process.env` inside a provider's constructor/lifecycle, not
// top-level module code. Found by running the dev server for real, not by
// reading the code.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  // Opt-in only — never derived from NODE_ENV !== 'production' (see rally's
  // own CLAUDE.md: that pattern published /api/docs on every non-prod-labelled
  // environment by accident).
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder().setTitle('SoloDesk backend-api').setVersion('0.1.0').build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
