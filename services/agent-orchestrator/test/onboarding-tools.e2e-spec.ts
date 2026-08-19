import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { setBusinessProfile } from '../src/temporal/activities/tools/set-business-profile.tool';
import { addFirstProduct } from '../src/temporal/activities/tools/add-first-product.tool';
import { connectSepay } from '../src/temporal/activities/tools/connect-sepay.tool';

/**
 * Only the config-error path is tested here, deterministically, with no
 * live dependency — same precedent as `get-sales-forecast.e2e-spec.ts`:
 * these tools call real backend-api/connector-hub HTTP endpoints, and a
 * real-HTTP-call happy-path test would need those services actually
 * running, flaky-by-construction in CI. The real happy path (a real
 * onboarding conversation, real tenant profile update, real SKU creation,
 * real encrypted vault write) was verified manually against the live dev
 * stack — see CLAUDE.md.
 */
describe('Onboarding tools — config-error path, no live backend-api/connector-hub dependency', () => {
  const original = process.env.INTERNAL_SERVICE_TOKEN;

  beforeEach(() => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  afterEach(() => {
    if (original !== undefined) process.env.INTERNAL_SERVICE_TOKEN = original;
  });

  it('setBusinessProfile throws a non-retryable ApplicationFailure when INTERNAL_SERVICE_TOKEN is not set', async () => {
    await expect(setBusinessProfile({ tenantId: 'irrelevant', industry: 'agriculture' })).rejects.toThrow(ApplicationFailure);
  });

  it('addFirstProduct throws a non-retryable ApplicationFailure when INTERNAL_SERVICE_TOKEN is not set', async () => {
    await expect(addFirstProduct({ tenantId: 'irrelevant', name: 'Cà phê', unit: 'kg', unitPrice: '50000' })).rejects.toThrow(ApplicationFailure);
  });

  it('connectSepay throws a non-retryable ApplicationFailure when INTERNAL_SERVICE_TOKEN is not set', async () => {
    await expect(connectSepay({ tenantId: 'irrelevant', apiToken: 'sk_test_123' })).rejects.toThrow(ApplicationFailure);
  });
});
