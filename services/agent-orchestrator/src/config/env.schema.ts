import { z } from 'zod';

/**
 * Validated at boot, fail fast — same convention as backend-api/connector-hub's
 * `env.schema.ts`. Every new env var goes here AND in `.env.example` AND in CI.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3002),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL must connect as solodesk_agent (SELECT-only), never the migration admin role'),
    DATABASE_POOL_SIZE: z.coerce.number().default(10),
    SWAGGER_ENABLED: booleanish.default(false),

    // Auth (JWT verification only — same mechanism as backend-api's auth.module.ts).
    REDIS_URL: z.string().min(1, 'REDIS_URL backs the auth-token denylist (AuthTokenCache) — required, not optional, since denylist checks fail loud not open'),
    REDIS_KEY_PREFIX: z.string().default('solodesk:'),
    JWT_PUBLIC_KEY: z.string().min(1, 'ES256 PEM public key — verifies access tokens'),
    JWT_ISSUER: z.string().default('solodesk'),
    JWT_AUDIENCE: z.string().default('solodesk-api'),
    DEV_JWT_PRIVATE_KEY: z.string().optional(),

    // Temporal — local dev: `temporal server start-dev` (official CLI,
    // embedded sqlite, no external DB). TEMPORAL_ADDRESS/NAMESPACE are the
    // same for self-hosted-dev and Temporal Cloud; only the address host
    // and (for Cloud) mTLS client cert differ — self-hosted-vs-Cloud is an
    // explicitly unresolved docs Section 13 business decision, not decided
    // by this schema.
    TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
    TEMPORAL_NAMESPACE: z.string().default('default'),
    TEMPORAL_TASK_QUEUE: z.string().default('agent-tasks'),

    // LLM — calling the Anthropic SDK directly (docs Section 5.5: "calling
    // the Anthropic/OpenAI/Google SDKs directly... is sufficient"). No
    // LiteLLM gateway / multi-provider fallback / per-tenant budget yet —
    // explicit first-cut scope, see CLAUDE.md.
    ANTHROPIC_API_KEY: z.string().min(1, 'Real key entered by the user — see CLAUDE.md. A placeholder value fails every real agent turn loudly, not silently.'),
    // Verify against Anthropic's current model list before relying on this
    // default in a real conversation — model ids change over time and this
    // value is not re-verified by this schema.
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),

    // Embeddings — Anthropic doesn't offer an embeddings endpoint; Voyage AI
    // is Anthropic's own recommended embeddings partner. Used only by
    // search-knowledge-base.tool.ts (Layer B / RAG) and
    // scripts/ingest-knowledge.ts — never by the SQL-backed Layer A tools.
    VOYAGE_API_KEY: z.string().min(1, 'Real key entered by the user — see CLAUDE.md. A placeholder value fails every knowledge-base search loudly, not silently.'),
    VOYAGE_API_BASE_URL: z.string().default('https://api.voyageai.com/v1'),
    VOYAGE_EMBEDDING_MODEL: z.string().default('voyage-3.5'),

    // ml-analytics — called ONLY from inside this Activity (never
    // synchronously from an HTTP handler outside a Workflow/Activity, docs
    // Section 5.5's rule), same as backend-api/connector-hub's internal
    // service-to-service call. Shared secret MUST match ml-analytics's own
    // INTERNAL_SERVICE_TOKEN exactly.
    ML_ANALYTICS_BASE_URL: z.string().default('http://localhost:3003'),
    INTERNAL_SERVICE_TOKEN: z.string().min(32, "INTERNAL_SERVICE_TOKEN must match ml-analytics's value exactly — see its config.py"),

    // Onboarding copilot (docs Section 5.4) — WRITE-capable tools, used
    // ONLY in mode='onboarding' conversations (never the default assistant
    // mode). set-business-profile/add-first-product call backend-api;
    // connect-sepay calls connector-hub's vault. Same INTERNAL_SERVICE_TOKEN
    // as above, now a 3rd/4th consumer of the same shared secret — MUST
    // match backend-api's and connector-hub's values exactly.
    BACKEND_API_BASE_URL: z.string().default('http://localhost:3000/v1'),
    CONNECTOR_HUB_BASE_URL: z.string().default('http://localhost:3001/v1'),
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
