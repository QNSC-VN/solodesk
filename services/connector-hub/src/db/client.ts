import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * The ONLY connection string the running app ever uses is the
 * `solodesk_connector` role (0001_provision_connector_role.sql) — never
 * DATABASE_ADMIN_URL, that one is migration-only. `solodesk_connector` is a
 * DIFFERENT role from backend-api's `solodesk_app`, granted USAGE only on
 * `vault`/`sync` — not `identity`/`catalog`/`sales`/`tax`/`payments`/
 * `booking`/`procurement`/`traceability`. This is the docs' "security
 * boundary" rationale for connector-hub (Section 3) enforced at the DB
 * level, not just by deployable separation: a compromised connector-hub
 * process cannot read backend-api's tenant business data, and a compromised
 * backend-api process cannot read the credential vault.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (must connect as solodesk_connector, never as the migration admin role).');
}

const client = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
});

export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });
export type Db = typeof db;
