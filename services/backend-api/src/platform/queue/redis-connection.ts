import IORedis from 'ioredis';

/**
 * BullMQ's own connection, separate from `@qnsc-vn/platform-cache`'s
 * internal client (that package doesn't expose its raw ioredis instance
 * for reuse, and BullMQ needs specific connection options — a dedicated
 * connection is BullMQ's own recommended shape, not a workaround). Same
 * Valkey instance as the auth-token denylist (`REDIS_URL`) — no new
 * infrastructure, matching docs' own rationale for choosing BullMQ here
 * ("Valkey is already in the stack... Redis-protocol compatible... BullMQ
 * works unchanged").
 */
let connection: IORedis | undefined;

export function getQueueRedisConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL is required for the invoice-pdf queue.');
    }
    // BullMQ requires this exact setting — it manages its own retry/backoff
    // logic and will throw at startup if ioredis is allowed to give up first.
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}
