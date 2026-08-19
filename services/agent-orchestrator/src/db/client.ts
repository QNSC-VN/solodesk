import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * The ONLY connection string the running app ever uses is the
 * `solodesk_agent` role — SELECT-only on `identity.tenants`/`sales.orders`
 * (see migration 0001's header comment). Never DATABASE_ADMIN_URL.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (must connect as solodesk_agent, never as the migration admin role).');
}

const client = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
});

export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });
export type Db = typeof db;
