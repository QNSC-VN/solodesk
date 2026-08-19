import { z } from 'zod';

/**
 * Validated at boot, fail fast — same convention as rally
 * (libs/platform/src/config/env.schema.ts). Every new env var goes here AND
 * in .env.example AND in CI AND in infra/live/*.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL must connect as solodesk_app, never the migration admin role'),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  SWAGGER_ENABLED: booleanish.default(false),

  // Auth (JWT verification only — see src/platform/auth/README-scope note).
  REDIS_URL: z.string().min(1, 'REDIS_URL backs the auth-token denylist (AuthTokenCache) — required, not optional, since denylist checks fail loud not open'),
  REDIS_KEY_PREFIX: z.string().default('solodesk:'),
  JWT_PUBLIC_KEY: z.string().min(1, 'ES256 PEM public key — verifies access tokens'),
  JWT_ISSUER: z.string().default('solodesk'),
  JWT_AUDIENCE: z.string().default('solodesk-api'),
  // Real login (src/modules/auth) — the ES256 signing key for real
  // signup/login/refresh session minting, distinct from DEV_JWT_PRIVATE_KEY
  // below (which stays dev/test-only, untouched — see that var's own comment).
  JWT_PRIVATE_KEY: z.string().min(1, 'ES256 PEM private key — signs real login/signup access tokens'),
  // Dev/test-only: mints tokens locally without going through a real signup/
  // login flow (mint-dev-token.ts), useful for quickly testing OTHER
  // services against this one. Must never be set in a real deployed
  // environment — a service that can both sign and verify its own tokens
  // for this path is not authenticating anyone, it's trusting itself.
  DEV_JWT_PRIVATE_KEY: z.string().optional(),
  // Real login — Google Sign-In (self-serve signup/login).
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, 'Google Cloud Console OAuth client id — expected id_token audience'),
  // "Let key, I will input later": unset in local dev/test, EmailService
  // logs the email instead of sending it — see that service's own comment.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().default('no-reply@solodesk.vn'),

  // Service-to-service — the ONLY route family this gates is
  // internal/payments (connector-hub forwarding a verified SePay payment
  // event). NOT a general internal-auth mechanism; a real mTLS/service-mesh
  // scheme is future work once more than one such route family exists
  // (see CLAUDE.md's connector-hub -> payment-reconcile section).
  INTERNAL_SERVICE_TOKEN: z.string().min(32, 'INTERNAL_SERVICE_TOKEN must be a real random secret, same value configured in connector-hub — checked via constant-time compare in InternalServiceGuard'),

  // Background jobs (BullMQ on the same Valkey as REDIS_URL) — invoice PDF
  // generation, src/worker-pdf.ts. Local filesystem for this first cut;
  // docs' eventual Cloudflare R2 object storage plan isn't built yet, same
  // "documented scope cut" as every other explicit first-cut simplification
  // in this repo.
  GENERATED_FILES_DIR: z.string().default('./generated'),
}).refine((env) => !(env.NODE_ENV === 'production' && env.DEV_JWT_PRIVATE_KEY), {
  message: 'DEV_JWT_PRIVATE_KEY must never be set when NODE_ENV=production — same guard rally uses for its dev-login path (see rally CLAUDE.md "Environment flags that look wrong and are not").',
  path: ['DEV_JWT_PRIVATE_KEY'],
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${result.error.toString()}`);
  }
  return result.data;
}
