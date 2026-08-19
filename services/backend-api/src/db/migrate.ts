import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

/**
 * Hand-written migration runner (drizzle-kit generate needs a TTY, migrations
 * here are authored by hand — see db/migrations/*.sql). Runs each .sql file in
 * order inside its own transaction, then runs scripts/verify-app-role.sql as a
 * hard gate: any row back means solodesk_app is superuser/BYPASSRLS somewhere,
 * and the deploy must fail loud instead of shipping silently-unenforced RLS
 * (exactly the failure mode rally hit — see 0002_provision_app_role.sql).
 */

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');
const VERIFY_SCRIPT = join(__dirname, '../../scripts/verify-app-role.sql');

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL is required to run migrations (needs role-creation privilege; solodesk_app itself must never run migrations, it cannot GRANT).');
  }
  const appRolePassword = process.env.SOLODESK_APP_ROLE_PASSWORD;
  if (!appRolePassword) {
    throw new Error('SOLODESK_APP_ROLE_PASSWORD is required (used by 0002_provision_app_role.sql).');
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
      // Only 0002 references :'app_role_password' — substitute it as a proper
      // SQL string literal before executing (raw `postgres` does not do
      // psql-style :'var' interpolation). Escape embedded single quotes by
      // doubling them, the standard SQL-literal escape — do NOT route this
      // through postgres.js's tagged-template machinery, which builds
      // parameterized-query fragments, not literal SQL text, and produces
      // garbage when stringified directly (this broke on first real run: a
      // stray "[" in the substituted output caused a 42601 syntax error).
      const escapedPassword = appRolePassword.replaceAll("'", "''");
      content = content.replaceAll(":'app_role_password'", `'${escapedPassword}'`);

      console.log(`Applying ${file}...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO public.schema_migrations (filename) VALUES (${file})`;
      });
    }

    console.log('Running app-role safety gate (scripts/verify-app-role.sql)...');
    const verifyContent = readFileSync(VERIFY_SCRIPT, 'utf-8');
    const unsafeRows = await sql.unsafe(verifyContent);
    if (unsafeRows.length > 0) {
      throw new Error(
        `FATAL: solodesk_app has rolsuper or rolbypassrls set — every RLS policy in this database is a silent no-op. ` +
        `Fix the role before deploying further. Rows: ${JSON.stringify(unsafeRows)}`,
      );
    }
    console.log('App-role gate passed: solodesk_app is neither superuser nor BYPASSRLS.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
