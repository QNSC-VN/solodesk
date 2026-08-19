import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

/**
 * Real Postgres, no mocks — `solodesk_agent`'s boundary is READ-ONLY on
 * exactly the tables it's been GRANTed (identity.tenants, sales.orders),
 * nothing else. Different shape from connector-hub's role-isolation test
 * (which proves ZERO access to backend-api's schemas) — here the point is
 * READ yes, WRITE no, and no access beyond the specific tables granted.
 */
describe('solodesk_agent role isolation — real Postgres, no mocks', () => {
  it('CAN read sales.orders', async () => {
    await expect(db.execute(sql`SELECT * FROM sales.orders LIMIT 1`)).resolves.toBeDefined();
  });

  it('CANNOT insert into sales.orders — read-only, by design', async () => {
    await expect(
      db.execute(sql`INSERT INTO sales.orders (tenant_id, channel, status, total_amount) VALUES (gen_random_uuid(), 'counter', 'confirmed', '1.00')`),
    ).rejects.toThrow();
  });

  it('CANNOT read a table it has not been explicitly GRANTed on (catalog.skus)', async () => {
    await expect(db.execute(sql`SELECT * FROM catalog.skus LIMIT 1`)).rejects.toThrow();
  });

  it('CANNOT read connector-hub\'s vault schema', async () => {
    await expect(db.execute(sql`SELECT * FROM vault.credentials LIMIT 1`)).rejects.toThrow();
  });
});
