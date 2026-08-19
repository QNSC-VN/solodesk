import { circuitBreaker, retry, handleWhen, ConsecutiveBreaker, ExponentialBackoff, wrap, type IPolicy } from 'cockatiel';
import { RetryableConnectorError } from './connector-http';

const isRetryable = handleWhen((err) => err instanceof RetryableConnectorError);

/**
 * One policy instance PER PROVIDER — this is the "bulkhead" docs Section
 * 5.4 asks for: a degraded Shopee must never trip the breaker (or exhaust
 * the retry budget) for GHN or SePay. Cached in this module-level Map so
 * the circuit breaker's open/closed state actually persists ACROSS calls
 * for the same provider (a fresh breaker per call would never open).
 *
 * Temporal's Activity retry policy is the primary retry mechanism once
 * `agent-orchestrator` exists (docs Section 5.4) — this in-process
 * retry+breaker is what runs INSIDE a single call attempt, same relationship
 * as an HTTP client's own retry vs. a job queue's retry.
 */
const policies = new Map<string, IPolicy>();

export function getConnectorPolicy(provider: string): IPolicy {
  let policy = policies.get(provider);
  if (!policy) {
    const retryPolicy = retry(isRetryable, { maxAttempts: 3, backoff: new ExponentialBackoff() });
    const breakerPolicy = circuitBreaker(isRetryable, {
      halfOpenAfter: 30_000,
      breaker: new ConsecutiveBreaker(5),
    });
    policy = wrap(retryPolicy, breakerPolicy);
    policies.set(provider, policy);
  }
  return policy;
}

export async function callWithResilience<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  return getConnectorPolicy(provider).execute(() => fn());
}
