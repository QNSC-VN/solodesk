import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

/**
 * Same hand-written-migration-runner shape as backend-api's `db/migrate.ts`
 * — copy-pasted, not shared via an internal package (Section 20.6 YAGNI: a
 * shared `@solodesk/db-toolkit` isn't earned by two call sites yet). Targets
 * the SAME Postgres database as backend-api (Section 3: one modular-monolith
 * database, separate schemas per bounded context, separate compute per
 * deployable) — `public.schema_migrations` is a single ledger table shared
 * by both services' migrators; filenames must stay globally unique across
 * both migration directories (they already are: backend-api's are
 * `0001_init_identity_schema.sql` etc., this service's are
 * `0001_provision_connector_role.sql` etc. — different exact strings, no
 * primary-key collision).
 */

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');
const VERIFY_SCRIPT = join(__dirname, '../../scripts/verify-connector-role.sql');

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL is required to run migrations (needs role-creation privilege; solodesk_connector itself must never run migrations, it cannot GRANT).');
  }
  const rolePassword = process.env.SOLODESK_CONNECTOR_ROLE_PASSWORD;
  if (!rolePassword) {
    throw new Error('SOLODESK_CONNECTOR_ROLE_PASSWORD is required (used by 0001_provision_connector_role.sql).');
  }

  const sql = postgres(adminUrl, { max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const already = await sql`SELECT 1 FROM public.schema_migrations WHERE filename = ${file}`;
      if (already.length > 0) continue;

      let content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      // Only 0001 references :'connector_role_password' — plain SQL-literal
      // substitution (double embedded quotes), same reasoning as backend-api's
      // migrate.ts: postgres.js's tagged-template stringified directly builds
      // parameterized-query fragments, not literal SQL text.
      const escapedPassword = rolePassword.replaceAll("'", "''");
      content = content.replaceAll(":'connector_role_password'", `'${escapedPassword}'`);

      console.log(`Applying ${file}...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO public.schema_migrations (filename) VALUES (${file})`;
      });
    }

    console.log('Running connector-role safety gate (scripts/verify-connector-role.sql)...');
    const verifyContent = readFileSync(VERIFY_SCRIPT, 'utf-8');
    const unsafeRows = await sql.unsafe(verifyContent);
    if (unsafeRows.length > 0) {
      throw new Error(
        `FATAL: solodesk_connector has rolsuper or rolbypassrls set — every RLS policy in this database is a silent no-op. ` +
        `Fix the role before deploying further. Rows: ${JSON.stringify(unsafeRows)}`,
      );
    }
    console.log('Connector-role gate passed: solodesk_connector is neither superuser nor BYPASSRLS.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
