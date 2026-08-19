import { Connection, WorkflowClient } from '@temporalio/client';

let cachedClient: WorkflowClient | undefined;

/**
 * Singleton — a single long-lived gRPC connection reused across requests,
 * same reasoning as `db/client.ts`'s single connection pool. Lazily
 * connects on first use rather than at module-load time, so a missing/
 * unreachable Temporal server fails inside a request (a clear 5xx via
 * `GlobalExceptionFilter`), not at process boot.
 */
export async function getTemporalClient(): Promise<WorkflowClient> {
  if (cachedClient) return cachedClient;

  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  cachedClient = new WorkflowClient({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' });
  return cachedClient;
}
