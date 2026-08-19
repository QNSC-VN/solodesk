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
  // Dev/test-only: mints tokens locally since no real login/SSO flow exists yet
  // (Sprint 1+ scope). Must never be set in a real deployed environment — a
  // service that can both sign and verify its own tokens is not authenticating
  // anyone, it's trusting itself.
  DEV_JWT_PRIVATE_KEY: z.string().optional(),

  // Service-to-service — the ONLY route family this gates is
  // internal/payments (connector-hub forwarding a verified SePay payment
  // event). NOT a general internal-auth mechanism; a real mTLS/service-mesh
  // scheme is future work once more than one such route family exists
  // (see CLAUDE.md's connector-hub -> payment-reconcile section).
  INTERNAL_SERVICE_TOKEN: z.string().min(32, 'INTERNAL_SERVICE_TOKEN must be a real random secret, same value configured in connector-hub — checked via constant-time compare in InternalServiceGuard'),
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
