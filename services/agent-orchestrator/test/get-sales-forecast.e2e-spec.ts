import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { getSalesForecast } from '../src/temporal/activities/tools/get-sales-forecast.tool';

/**
 * Only the config-error path is tested here, deterministically, with no
 * live dependency — CI has no ml-analytics service container (it needs a
 * Dockerfile and a Python build/publish CI action this org's shared
 * qnsc-ci doesn't have yet, see CLAUDE.md's honest gap note), so a
 * real-HTTP-call happy-path test would be flaky-by-construction in CI.
 * The real happy path (a real forecast, from real seeded sales.orders
 * data, through the real running ml-analytics service) was verified
 * manually — see CLAUDE.md.
 */
describe('getSalesForecast — config-error path, no live ml-analytics dependency', () => {
  const original = process.env.INTERNAL_SERVICE_TOKEN;

  beforeEach(() => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  afterEach(() => {
    if (original !== undefined) process.env.INTERNAL_SERVICE_TOKEN = original;
  });

  it('throws a non-retryable ApplicationFailure when INTERNAL_SERVICE_TOKEN is not set', async () => {
    await expect(getSalesForecast({ tenantId: 'irrelevant' })).rejects.toThrow(ApplicationFailure);
  });
});
