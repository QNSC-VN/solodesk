import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

/**
 * Real Postgres, no mocks — `solodesk_agent`'s boundary is READ-ONLY on
 * exactly the tables it's been GRANTed (identity.tenants, sales.orders,
 * catalog.skus, catalog.lots, tax.invoices, payments.payments,
 * booking.bookings, booking.resources — one migration per tool that
 * needed a new table, see 0001/0002/0003/0004), nothing else. Different
 * shape from connector-hub's role-isolation test (which proves ZERO
 * access to backend-api's schemas) — here the point is READ yes, WRITE
 * no, and no access BEYOND the specific tables granted.
 */
describe('solodesk_agent role isolation — real Postgres, no mocks', () => {
  it('CAN read every table its tools actually query', async () => {
    await expect(db.execute(sql`SELECT * FROM sales.orders LIMIT 1`)).resolves.toBeDefined();
    await expect(db.execute(sql`SELECT * FROM catalog.skus LIMIT 1`)).resolves.toBeDefined();
    await expect(db.execute(sql`SELECT * FROM catalog.lots LIMIT 1`)).resolves.toBeDefined();
    await expect(db.execute(sql`SELECT * FROM tax.invoices LIMIT 1`)).resolves.toBeDefined();
    await expect(db.execute(sql`SELECT * FROM payments.payments LIMIT 1`)).resolves.toBeDefined();
    await expect(db.execute(sql`SELECT * FROM booking.bookings LIMIT 1`)).resolves.toBeDefined();
    await expect(db.execute(sql`SELECT * FROM booking.resources LIMIT 1`)).resolves.toBeDefined();
  });

  it('CANNOT insert into sales.orders — read-only, by design', async () => {
    await expect(
      db.execute(sql`INSERT INTO sales.orders (tenant_id, channel, status, total_amount) VALUES (gen_random_uuid(), 'counter', 'confirmed', '1.00')`),
    ).rejects.toThrow();
  });

  it('CANNOT insert into catalog.skus — read-only, by design', async () => {
    await expect(
      db.execute(sql`INSERT INTO catalog.skus (tenant_id, sku_code, name, unit, unit_price) VALUES (gen_random_uuid(), 'X', 'X', 'cai', '1.00')`),
    ).rejects.toThrow();
  });

  it('CANNOT insert into tax.invoices — read-only, by design', async () => {
    await expect(
      db.execute(sql`INSERT INTO tax.invoices (tenant_id, order_id, invoice_number, tax_rule_id, subtotal, tax_rate, tax_amount, total_amount, requires_e_invoice, status)
        VALUES (gen_random_uuid(), gen_random_uuid(), 'X', gen_random_uuid(), '1.00', '0', '0', '1.00', false, 'issued')`),
    ).rejects.toThrow();
  });

  it('CANNOT insert into booking.bookings — read-only, by design', async () => {
    await expect(
      db.execute(sql`INSERT INTO booking.bookings (tenant_id, resource_id, customer_name, starts_at, ends_at) VALUES (gen_random_uuid(), gen_random_uuid(), 'X', now(), now() + interval '1 hour')`),
    ).rejects.toThrow();
  });

  it('CANNOT read a table it has not been explicitly GRANTed on (procurement.suppliers)', async () => {
    await expect(db.execute(sql`SELECT * FROM procurement.suppliers LIMIT 1`)).rejects.toThrow();
  });

  it('CANNOT read connector-hub\'s vault schema', async () => {
    await expect(db.execute(sql`SELECT * FROM vault.credentials LIMIT 1`)).rejects.toThrow();
  });
});
