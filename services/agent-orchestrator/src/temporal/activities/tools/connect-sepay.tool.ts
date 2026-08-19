import { ApplicationFailure } from '@temporalio/common';

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
  const baseUrl = process.env.CONNECTOR_HUB_BASE_URL ?? 'http://localhost:3001/v1';
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    throw ApplicationFailure.nonRetryable('INTERNAL_SERVICE_TOKEN is not set.', 'ConfigError');
  }

  const res = await fetch(`${baseUrl}/internal/onboarding/vault/${input.tenantId}/sepay/credentials`, {
    method: 'POST',
    headers: { 'X-Internal-Service-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { apiToken: input.apiToken } }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw ApplicationFailure.nonRetryable(`connector-hub returned ${res.status}: ${body}`, 'ConnectorHubNonRetryableError');
    }
    throw new Error(`connector-hub returned ${res.status}: ${body}`);
  }

  const body = (await res.json()) as { provider: string; isActive: boolean };
  return { provider: body.provider, isActive: body.isActive };
}
