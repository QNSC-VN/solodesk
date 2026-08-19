import { z } from 'zod';

/**
 * Validated at boot, fail fast — same convention as backend-api's
 * `env.schema.ts`. Every new env var goes here AND in `.env.example` AND in
 * CI AND in `infra/live/*`.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL must connect as solodesk_connector, never the migration admin role'),
    DATABASE_POOL_SIZE: z.coerce.number().default(10),
    SWAGGER_ENABLED: booleanish.default(false),

    // Auth (JWT verification only — same mechanism as backend-api's auth.module.ts).
    REDIS_URL: z.string().min(1, 'REDIS_URL backs the auth-token denylist (AuthTokenCache) — required, not optional, since denylist checks fail loud not open'),
    REDIS_KEY_PREFIX: z.string().default('solodesk:'),
    JWT_PUBLIC_KEY: z.string().min(1, 'ES256 PEM public key — verifies access tokens'),
    JWT_ISSUER: z.string().default('solodesk'),
    JWT_AUDIENCE: z.string().default('solodesk-api'),
    DEV_JWT_PRIVATE_KEY: z.string().optional(),

    // Vault — AES-256-GCM at rest for every vaulted third-party credential
    // (Section 5.4's "vault" layer). 32 raw bytes, base64-encoded. Generate
    // with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    VAULT_MASTER_KEY: z
      .string()
      .min(1, 'VAULT_MASTER_KEY is required — every stored third-party credential is encrypted with it')
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'VAULT_MASTER_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key)'),

    // Per-provider API base URLs — sandbox vs prod differ by environment,
    // never hardcoded in adapter code (Section 20.4's "no scattered literals"
    // discipline applied to endpoints, not just rates/thresholds).
    SEPAY_API_BASE_URL: z.string().default('https://my.sepay.vn/userapi'),
    GHN_API_BASE_URL: z.string().default('https://online-gateway.ghn.vn/shiip/public-api'),
    SHOPEE_API_BASE_URL: z.string().default('https://partner.shopeemobile.com'),

    // Service-to-service forwarding — SepayWebhookController calling
    // backend-api's POST /internal/payments/by-invoice-number. Same shared
    // secret MUST be set in backend-api/.env's INTERNAL_SERVICE_TOKEN.
    BACKEND_API_BASE_URL: z.string().default('http://localhost:3000/v1'),
    INTERNAL_SERVICE_TOKEN: z.string().min(32, 'INTERNAL_SERVICE_TOKEN must match backend-api\'s value exactly — see its env.schema.ts'),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.DEV_JWT_PRIVATE_KEY), {
    message: 'DEV_JWT_PRIVATE_KEY must never be set when NODE_ENV=production.',
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
