import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * The ONLY connection string the running app ever uses is the `solodesk_app`
 * role (Section 4.1 / 0002_provision_app_role.sql) — never DATABASE_ADMIN_URL,
 * that one is migration-only and must not be reachable from app runtime env.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (must connect as solodesk_app, never as the migration admin role).');
}

const client = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
});

export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });
export type Db = typeof db;
