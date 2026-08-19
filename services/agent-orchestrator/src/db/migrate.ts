import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

/**
 * Same hand-written-migration-runner shape as backend-api/connector-hub's
 * `db/migrate.ts`. Targets the SAME Postgres database as both other
 * services. IMPORTANT: run this AFTER backend-api's migrations in every
 * environment — 0001 GRANTs on tables backend-api's migrations create
 * (see that migration's header comment).
 */

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');
const VERIFY_SCRIPT = join(__dirname, '../../scripts/verify-agent-role.sql');

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL is required to run migrations (needs role-creation + cross-schema GRANT privilege).');
  }
  const rolePassword = process.env.SOLODESK_AGENT_ROLE_PASSWORD;
  if (!rolePassword) {
    throw new Error('SOLODESK_AGENT_ROLE_PASSWORD is required (used by 0001_provision_agent_role.sql).');
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
      const escapedPassword = rolePassword.replaceAll("'", "''");
      content = content.replaceAll(":'agent_role_password'", `'${escapedPassword}'`);

      console.log(`Applying ${file}...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO public.schema_migrations (filename) VALUES (${file})`;
      });
    }

    console.log('Running agent-role safety gate (scripts/verify-agent-role.sql)...');
    const verifyContent = readFileSync(VERIFY_SCRIPT, 'utf-8');
    const unsafeRows = await sql.unsafe(verifyContent);
    if (unsafeRows.length > 0) {
      throw new Error(
        `FATAL: solodesk_agent has rolsuper or rolbypassrls set — every RLS policy in this database is a silent no-op. ` +
        `Fix the role before deploying further. Rows: ${JSON.stringify(unsafeRows)}`,
      );
    }
    console.log('Agent-role gate passed: solodesk_agent is neither superuser nor BYPASSRLS.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
