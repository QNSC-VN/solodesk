import { internalServiceFetch } from '../../../platform/internal-service';

export interface ConnectSepayInput {
  tenantId: string;
  apiToken: string;
}

export interface ConnectSepayResult {
  provider: string;
  isActive: boolean;
}

export const CONNECT_SEPAY_TOOL_NAME = 'connect_sepay';

/**
 * Onboarding-only — the AI's one "connect a 3rd-party service for me" step
 * in this first cut (docs Section 5.4). SePay chosen over GHN/GHTK/Shopee
 * for the conversational setup step specifically: it needs exactly one
 * secret (an API token), vs. GHN/GHTK needing a pickup address + shop id
 * too — meaningfully more friction to collect correctly over a chat with a
 * non-technical user. Shipping-connector setup is real future work in this
 * same shape, not built here.
 *
 * The credential goes through connector-hub's REAL vault write path
 * (AES-256-GCM at rest) via its new `internal/onboarding/vault` endpoint —
 * this tool never stores or logs the token itself, only forwards it once.
 */
export const connectSepayToolSchema = {
  name: CONNECT_SEPAY_TOOL_NAME,
  description: 'Connect SePay (VietQR bank-transfer payments) using the API token the owner pastes in. Onboarding-only.',
  input_schema: {
    type: 'object' as const,
    properties: {
      apiToken: { type: 'string' as const, description: "The SePay API token the owner provides, copied from their SePay dashboard." },
    },
    required: ['apiToken'],
    additionalProperties: false,
  },
};

export async function connectSepay(input: ConnectSepayInput): Promise<ConnectSepayResult> {
  const json = (await internalServiceFetch('connector-hub', `/internal/onboarding/vault/${input.tenantId}/sepay/credentials`, {
    method: 'POST',
    body: { payload: { apiToken: input.apiToken } },
  })) as { provider: string; isActive: boolean };
  return { provider: json.provider, isActive: json.isActive };
}
