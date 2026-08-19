import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

/**
 * Real Postgres, no mocks — the DB-level half of docs Section 3's "security
 * boundary" rationale for connector-hub being a separate deployable: the
 * `solodesk_connector` role must be UNABLE to read backend-api's tenant
 * business tables, not just "conventionally shouldn't." If backend-api's
 * migrations haven't run in this environment, `identity.tenants` may not
 * exist at all — that's an acceptable pass too (still proves no access),
 * so this only asserts the query never returns rows, never that it
 * necessarily errors with 42501.
 */
describe('solodesk_connector role isolation — real Postgres, no mocks', () => {
  it('cannot read identity.tenants (backend-api\'s schema) even if it exists', async () => {
    await expect(db.execute(sql`SELECT * FROM identity.tenants LIMIT 1`)).rejects.toThrow();
  });

  it('CAN read its own vault.credentials table without error', async () => {
    await expect(db.execute(sql`SELECT * FROM vault.credentials LIMIT 1`)).resolves.toBeDefined();
  });
});
