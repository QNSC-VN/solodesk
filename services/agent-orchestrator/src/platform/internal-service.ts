import { ApplicationFailure } from '@temporalio/common';

/**
 * The ONE internal-service HTTP hop — the guard + headers + retry
 * classification five tools each hand-rolled (identical blocks differing
 * only in target name). Classification matches connector-hub's
 * `connectorFetch` and `createMessage`'s Anthropic rule: a 4xx other
 * than 429 can never succeed by retrying, so it is
 * `ApplicationFailure.nonRetryable` (stops the Activity retry policy
 * cold); everything else (429/5xx/network) stays retryable.
 *
 * Base-URL defaults live in ONE const (DEFAULT_TARGET_URLS) — the env
 * schema imports it for its `.default(...)` values, so code default and
 * schema default are the same expression and cannot drift (the audit
 * found five inline `?? 'http://…'` copies plus dead schema defaults).
 * The token stays a runtime check, not a boot-time schema requirement:
 * tools and their config-error tests run without full env by design.
 */
export const DEFAULT_TARGET_URLS = {
  'backend-api': 'http://localhost:3000/v1',
  'connector-hub': 'http://localhost:3001/v1',
  'ml-analytics': 'http://localhost:3003',
} as const;

export type InternalServiceTarget = keyof typeof DEFAULT_TARGET_URLS;

export async function internalServiceFetch(
  target: InternalServiceTarget,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> },
): Promise<unknown> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    throw ApplicationFailure.nonRetryable('INTERNAL_SERVICE_TOKEN is not set.', 'ConfigError');
  }
  const baseUrl = process.env[`${target.toUpperCase().replace(/-/g, '_')}_BASE_URL`] ?? DEFAULT_TARGET_URLS[target];

  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(init?.query ?? {})) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: { 'X-Internal-Service-Token': token, 'Content-Type': 'application/json' },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw ApplicationFailure.nonRetryable(`${target} returned ${res.status}: ${body}`, 'InternalServiceNonRetryableError');
    }
    throw new Error(`${target} returned ${res.status}: ${body}`);
  }
  return res.json();
}
