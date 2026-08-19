"""
Same hand-written-migration-runner shape as the other 3 services'
db/migrate.ts (backend-api/connector-hub/agent-orchestrator) — Python here
only because this service is, everything else about the convention
(schema_migrations tracking, transactional apply, a role-safety gate that
fails the deploy loudly) carries over unchanged. Targets the SAME Postgres
database as all 3 other services. IMPORTANT: run this AFTER backend-api's
migrations in every environment — 0001 GRANTs on sales.orders, which
backend-api's migrations create.
"""

import asyncio
import os
import sys
from pathlib import Path

import asyncpg

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
VERIFY_SCRIPT = Path(__file__).parent / "verify_ml_role.sql"


async def main() -> None:
    admin_url = os.environ.get("DATABASE_ADMIN_URL")
    if not admin_url:
        raise RuntimeError("DATABASE_ADMIN_URL is required to run migrations (needs role-creation + cross-schema GRANT privilege).")
    role_password = os.environ.get("SOLODESK_ML_ROLE_PASSWORD")
    if not role_password:
        raise RuntimeError("SOLODESK_ML_ROLE_PASSWORD is required (used by 0001_provision_ml_role.sql).")

    conn = await asyncpg.connect(admin_url)
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                filename text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )

        files = sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))

        for filename in files:
            already = await conn.fetchval("SELECT 1 FROM public.schema_migrations WHERE filename = $1", filename)
            if already:
                continue

            content = (MIGRATIONS_DIR / filename).read_text()
            escaped_password = role_password.replace("'", "''")
            content = content.replace(":'ml_role_password'", f"'{escaped_password}'")

            print(f"Applying {filename}...")
            async with conn.transaction():
                await conn.execute(content)
                await conn.execute("INSERT INTO public.schema_migrations (filename) VALUES ($1)", filename)

        print("Running ml-role safety gate (db/verify_ml_role.sql)...")
        verify_content = VERIFY_SCRIPT.read_text()
        unsafe_rows = await conn.fetch(verify_content)
        if unsafe_rows:
            raise RuntimeError(
                f"FATAL: solodesk_ml has rolsuper or rolbypassrls set — every RLS policy in this database is a silent "
                f"no-op. Fix the role before deploying further. Rows: {[dict(r) for r in unsafe_rows]}"
            )
        print("ML-role gate passed: solodesk_ml is neither superuser nor BYPASSRLS.")
    finally:
        await conn.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:  # noqa: BLE001 - top-level script, mirrors the TS runners' catch-and-exit(1)
        print(err, file=sys.stderr)
        sys.exit(1)
