import { internalServiceFetch } from '../../../platform/internal-service';

export interface SetBusinessProfileInput {
  tenantId: string;
  legalName?: string;
  industry?: 'food_beverage' | 'tourism' | 'agriculture';
}

export interface SetBusinessProfileResult {
  legalName: string;
  industry: string;
}

export const SET_BUSINESS_PROFILE_TOOL_NAME = 'set_business_profile';

/**
 * Onboarding-only tool (docs Section 5.4's "onboarding copilot flow": agent
 * proposes a step -> calls a broker tool to execute it -> reports the
 * outcome). Registered ONLY in `ONBOARDING_TOOLS`, never
 * `ASSISTANT_TOOLS` — the regular assistant conversation stays
 * SELECT-only/read-only by design (see agent-orchestrator's whole
 * `solodesk_agent` role rationale); this is the one deliberate exception,
 * scoped to a separate conversation mode.
 */
export const setBusinessProfileToolSchema = {
  name: SET_BUSINESS_PROFILE_TOOL_NAME,
  description: "Set the caller's business name and/or industry type. Industry must be exactly one of: food_beverage, tourism, agriculture — pick the closest match from what the user describes in their own words.",
  input_schema: {
    type: 'object' as const,
    properties: {
      legalName: { type: 'string' as const, description: "The business's name, as the owner said it." },
      industry: { type: 'string' as const, enum: ['food_beverage', 'tourism', 'agriculture'], description: 'Closest matching industry category.' },
    },
    additionalProperties: false,
  },
};

/**
 * Calls backend-api's internal onboarding endpoint from inside this
 * Activity (never synchronously outside a Workflow/Activity, docs Section
 * 5.5's rule — same discipline as `get-sales-forecast.tool.ts`).
 * `INTERNAL_SERVICE_TOKEN` here is the 4th application of the same shared
 * secret (1st: connector-hub -> backend-api, 2nd: agent-orchestrator ->
 * ml-analytics, 3rd: this service -> connector-hub's vault, below).
 */
export async function setBusinessProfile(input: SetBusinessProfileInput): Promise<SetBusinessProfileResult> {
  const json = (await internalServiceFetch('backend-api', `/internal/onboarding/tenants/${input.tenantId}/profile`, {
    method: 'POST',
    body: {
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
    },
  })) as { legalName: string; industry: string };

  return { legalName: json.legalName, industry: json.industry };
}
