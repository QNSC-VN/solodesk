import { ApplicationFailure } from '@temporalio/common';

export interface GetSalesForecastInput {
  tenantId: string;
  days?: number;
}

export interface ForecastPoint {
  day: string;
  projectedAmount: string;
}

export interface GetSalesForecastResult {
  historyDaysUsed: number;
  forecast: ForecastPoint[];
}

export const GET_SALES_FORECAST_TOOL_NAME = 'get_sales_forecast';

export const getSalesForecastToolSchema = {
  name: GET_SALES_FORECAST_TOOL_NAME,
  description: "Project the caller's own upcoming daily revenue from their recent order history — a simple statistical baseline, not a guarantee. Read-only.",
  input_schema: {
    type: 'object' as const,
    properties: {
      days: { type: 'integer' as const, description: 'How many days ahead to forecast, 1-30. Defaults to 7.' },
    },
    additionalProperties: false,
  },
};

/**
 * The one tool that calls another SERVICE, not Postgres directly — the 4th
 * deployable (`services/ml-analytics`, Python/FastAPI). Called from
 * INSIDE this Activity, satisfying docs Section 5.5's rule that any call
 * to ml-analytics happens inside a Temporal Activity (never synchronously
 * from an HTTP handler outside a Workflow/Activity — the exact gap
 * `cxgenie-be`'s raw synchronous calls left open, see CLAUDE.md).
 * `INTERNAL_SERVICE_TOKEN` is the 2nd consumer of the same shared-secret
 * mechanism backend-api's `InternalServiceGuard` already uses for
 * connector-hub — same shape, no redesign needed.
 */
export async function getSalesForecast(input: GetSalesForecastInput): Promise<GetSalesForecastResult> {
  const baseUrl = process.env.ML_ANALYTICS_BASE_URL ?? 'http://localhost:3003';
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    throw ApplicationFailure.nonRetryable('INTERNAL_SERVICE_TOKEN is not set.', 'ConfigError');
  }

  const url = new URL(`${baseUrl}/v1/forecast/${input.tenantId}`);
  if (input.days !== undefined) url.searchParams.set('days', String(input.days));

  const res = await fetch(url, { headers: { 'X-Internal-Service-Token': token } });
  if (!res.ok) {
    const body = await res.text();
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw ApplicationFailure.nonRetryable(`ml-analytics returned ${res.status}: ${body}`, 'MlAnalyticsNonRetryableError');
    }
    throw new Error(`ml-analytics returned ${res.status}: ${body}`);
  }

  const body = (await res.json()) as { history_days_used: number; forecast: Array<{ day: string; projected_amount: string }> };
  return {
    historyDaysUsed: body.history_days_used,
    forecast: body.forecast.map((p) => ({ day: p.day, projectedAmount: p.projected_amount })),
  };
}
