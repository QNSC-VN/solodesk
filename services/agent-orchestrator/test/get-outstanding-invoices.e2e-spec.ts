import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { getOutstandingInvoices } from '../src/temporal/activities/tools/get-outstanding-invoices.tool';

/** Real Postgres, no mocks — fixtures seeded via the admin connection, same reasoning as the other tool e2e specs. */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

async function seedTenant(legalName: string): Promise<string> {
  const rows = await adminSql`INSERT INTO identity.tenants (legal_name, industry) VALUES (${legalName}, 'food_beverage') RETURNING id`;
  return rows[0]!.id as string;
}

async function seedOrder(tenantId: string, totalAmount: string): Promise<string> {
  const rows = await adminSql`
    INSERT INTO sales.orders (tenant_id, channel, status, total_amount)
    VALUES (${tenantId}, 'counter', 'confirmed', ${totalAmount})
    RETURNING id
  `;
  return rows[0]!.id as string;
}

async function seedInvoice(tenantId: string, invoiceNumber: string, totalAmount: string, issuedAt: Date, status = 'issued'): Promise<string> {
  const orderId = await seedOrder(tenantId, totalAmount);
  // tax_rule_id/tax_rate/tax_amount/subtotal/requires_e_invoice have no
  // relevance to this tool's query beyond satisfying NOT NULL/FK — filled
  // with harmless real-row references since this test only needs
  // invoice_number/total_amount/status/issued_at.
  const rows = await adminSql`
    INSERT INTO tax.invoices (tenant_id, order_id, invoice_number, tax_rule_id, subtotal, tax_rate, tax_amount, total_amount, requires_e_invoice, status, issued_at)
    VALUES (
      ${tenantId},
      ${orderId},
      ${invoiceNumber},
      (SELECT id FROM tax.tax_rules LIMIT 1),
      ${totalAmount}, '0.0000', '0.00', ${totalAmount}, false, ${status}, ${issuedAt.toISOString()}
    )
    RETURNING id
  `;
  return rows[0]!.id as string;
}

async function seedPayment(tenantId: string, invoiceId: string, amount: string): Promise<void> {
  await adminSql`INSERT INTO payments.payments (tenant_id, invoice_id, method, amount) VALUES (${tenantId}, ${invoiceId}, 'cash', ${amount})`;
}

describe('getOutstandingInvoices tool — real Postgres, no mocks', () => {
  it('lists only invoices with an outstanding balance, oldest first, excluding fully-paid and cancelled ones', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Invoices');

    const oldInvoiceId = await seedInvoice(tenantId, 'INV-2026-000001', '100000.00', new Date('2026-01-01T00:00:00Z'));
    await seedPayment(tenantId, oldInvoiceId, '40000.00'); // partially paid, outstanding 60000

    const newInvoiceId = await seedInvoice(tenantId, 'INV-2026-000002', '50000.00', new Date('2026-02-01T00:00:00Z'));
    // no payment at all — fully outstanding 50000

    const paidInvoiceId = await seedInvoice(tenantId, 'INV-2026-000003', '30000.00', new Date('2026-01-15T00:00:00Z'));
    await seedPayment(tenantId, paidInvoiceId, '30000.00'); // fully paid — must be excluded

    await seedInvoice(tenantId, 'INV-2026-000004', '99999.00', new Date('2026-01-20T00:00:00Z'), 'cancelled'); // cancelled — must be excluded

    const result = await getOutstandingInvoices({ tenantId });

    expect(result.count).toBe(2);
    expect(result.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-2026-000001', 'INV-2026-000002']); // oldest first
    expect(result.invoices[0]!.outstandingAmount).toBe('60000.00');
    expect(result.invoices[1]!.outstandingAmount).toBe('50000.00');
  });

  it('a tenant with no invoices at all gets an empty list, not an error', async () => {
    const tenantId = await seedTenant('Agent Test Tenant No Invoices');

    const result = await getOutstandingInvoices({ tenantId });

    expect(result.count).toBe(0);
    expect(result.invoices).toEqual([]);
  });

  it('never returns more than the cap, even with many outstanding invoices', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Many Invoices');
    for (let i = 0; i < 25; i += 1) {
      await seedInvoice(tenantId, `INV-2026-CAP-${i}`, '1000.00', new Date(Date.UTC(2026, 0, 1 + i)));
    }

    const result = await getOutstandingInvoices({ tenantId });

    expect(result.count).toBeLessThanOrEqual(20);
  });
});
