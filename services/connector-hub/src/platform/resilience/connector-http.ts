const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Errors thrown by adapters must be one of these two — never a bare `Error`
 * — so `getConnectorPolicy`'s retry/circuit-breaker predicate (see
 * `connector-policy.ts`) can tell a "try again" failure from a "this will
 * never succeed, stop wasting rate-limit budget" failure. A malformed
 * request (4xx, except 429) is non-retryable; a hung/network/5xx/429
 * failure is retryable — the classification docs Section 5.4 asks for.
 */
export class RetryableConnectorError extends Error {}
export class NonRetryableConnectorError extends Error {}

function classify(status: number): boolean {
  if (status === 429) return true;
  return status >= 500;
}

/**
 * The one place every connector adapter makes an outbound HTTP call —
 * short client-level timeout (~10s, docs Section 5.4) so a hung third-party
 * call can never sit inside the caller's own budget unnoticed. Network
 * errors and timeouts are always retryable (no response at all to classify).
 */
export async function connectorFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new RetryableConnectorError(`Network/timeout error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const message = `${res.status} ${res.statusText} from ${url}: ${body.slice(0, 500)}`;
    if (classify(res.status)) {
      throw new RetryableConnectorError(message);
    }
    throw new NonRetryableConnectorError(message);
  }

  return res;
}
