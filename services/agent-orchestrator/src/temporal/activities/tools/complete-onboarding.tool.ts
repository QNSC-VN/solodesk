import { internalServiceFetch } from '../../../platform/internal-service';

export interface CompleteOnboardingInput {
  tenantId: string;
}

export interface CompleteOnboardingResult {
  activatedAt: string | null;
}

export const COMPLETE_ONBOARDING_TOOL_NAME = 'complete_onboarding';

/**
 * The final onboarding step — sets `activatedAt` on the tenant, the one
 * signal a client (the mobile app) checks on login to decide whether to
 * show the onboarding conversation or the normal home screen
 * (`GET /v1/tenants/:id`'s `activatedAt`). Before this tool existed, the
 * onboarding flow's own "confirm everything in one short summary" final
 * step was plain text with no tool call — `TenantService.activateTenant`
 * was real but never actually reachable from anywhere, found while
 * designing the mobile app's login routing.
 */
export const completeOnboardingToolSchema = {
  name: COMPLETE_ONBOARDING_TOOL_NAME,
  description: 'Call this ONCE, after confirming the setup summary to the owner, to mark onboarding as finished. Do not call it before industry, business name, and first product are all set.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
};

/** Same cross-service Activity-only calling discipline as the other onboarding tools. */
export async function completeOnboarding(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
  const json = (await internalServiceFetch('backend-api', `/internal/onboarding/tenants/${input.tenantId}/complete`, {
    method: 'POST',
  })) as { activatedAt: string | null };
  return { activatedAt: json.activatedAt };
}
