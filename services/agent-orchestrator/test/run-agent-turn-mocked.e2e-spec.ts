import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { runAgentTurn } from '../src/temporal/activities/run-agent-turn.activity';

/**
 * Real Postgres, no mocks at the DATA layer — only `MOCK_LLM_RESPONSES=true`
 * is set, exercising the demo-only keyword-matched branch
 * (`runAgentTurnMocked` in `run-agent-turn.activity.ts`). Every assertion
 * here is checking that REAL tool data (seeded via the admin connection)
 * makes it into the mocked reply, not that the mock itself is "smart."
 */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1 });

beforeAll(() => {
  process.env.MOCK_LLM_RESPONSES = 'true';
});

afterAll(async () => {
  delete process.env.MOCK_LLM_RESPONSES;
  await adminSql.end();
});

async function seedTenant(legalName: string): Promise<string> {
  const rows = await adminSql`INSERT INTO identity.tenants (legal_name, industry) VALUES (${legalName}, 'food_beverage') RETURNING id`;
  return rows[0]!.id as string;
}

describe('runAgentTurn with MOCK_LLM_RESPONSES=true — real Postgres, mocked LLM only', () => {
  it('a stock question calls the REAL get_stock_level tool and embeds its real result', async () => {
    const tenantId = await seedTenant('Agent Mock Test Tenant Stock');
    await adminSql`INSERT INTO catalog.skus (tenant_id, sku_code, name, unit, unit_price) VALUES (${tenantId}, 'SKU-MOCK-1', 'Demo item', 'cai', '5000.00')`;

    const result = await runAgentTurn({ tenantId, history: [], userMessage: 'Còn tồn kho SKU-MOCK-1 không?' });

    expect(result.assistantMessage).toMatch(/^\[MOCK\]/);
    expect(result.assistantMessage).toContain('SKU-MOCK-1');
    expect(result.assistantMessage).toContain('Demo item');
  });

  it('an invoice question with zero outstanding invoices says so, using the real tool result', async () => {
    const tenantId = await seedTenant('Agent Mock Test Tenant Invoices');

    const result = await runAgentTurn({ tenantId, history: [], userMessage: 'Có hóa đơn nào chưa thanh toán không?' });

    expect(result.assistantMessage).toMatch(/^\[MOCK\]/);
    expect(result.assistantMessage).toContain('Không có hóa đơn');
  });

  it('a booking question calls the REAL get_upcoming_bookings tool and embeds its real result', async () => {
    const tenantId = await seedTenant('Agent Mock Test Tenant Bookings');
    const [resource] = await adminSql`INSERT INTO booking.resources (tenant_id, name, resource_type, capacity) VALUES (${tenantId}, 'Phong Deluxe', 'room', 1) RETURNING id`;
    await adminSql`
      INSERT INTO booking.bookings (tenant_id, resource_id, customer_name, starts_at, ends_at, party_size, status)
      VALUES (${tenantId}, ${resource!.id}, 'Chi Lan', now() + interval '2 hours', now() + interval '4 hours', 2, 'confirmed')
    `;

    const result = await runAgentTurn({ tenantId, history: [], userMessage: 'Sap toi co lich dat phong nao khong?' });

    expect(result.assistantMessage).toMatch(/^\[MOCK\]/);
    expect(result.assistantMessage).toContain('Phong Deluxe');
    expect(result.assistantMessage).toContain('Chi Lan');
  });

  it('a generic question falls back to the real sales summary', async () => {
    const tenantId = await seedTenant('Agent Mock Test Tenant Sales');

    const result = await runAgentTurn({ tenantId, history: [], userMessage: 'Xin chào' });

    expect(result.assistantMessage).toMatch(/^\[MOCK\]/);
    expect(result.assistantMessage).toContain('đơn hàng');
  });

  // Found by actually running scripts/demo-e2e.sh with plain-ASCII
  // Vietnamese questions: the keyword matcher's accented-only patterns
  // silently failed to recognize them, and every question fell through to
  // the wrong (sales-summary) default. Real users type unaccented
  // Vietnamese constantly — this is a regression test for that fix.
  it('matches the SAME keywords with NO diacritics at all (plain-ASCII Vietnamese)', async () => {
    const tenantId = await seedTenant('Agent Mock Test Tenant NoDiacritics');
    await adminSql`INSERT INTO catalog.skus (tenant_id, sku_code, name, unit, unit_price) VALUES (${tenantId}, 'SKU-ASCII-1', 'Demo item 2', 'cai', '5000.00')`;

    const stockResult = await runAgentTurn({ tenantId, history: [], userMessage: 'Con ton kho SKU-ASCII-1 khong?' });
    expect(stockResult.assistantMessage).toContain('SKU-ASCII-1');
    expect(stockResult.assistantMessage).toContain('Demo item 2');

    const invoiceResult = await runAgentTurn({ tenantId, history: [], userMessage: 'Co hoa don nao chua thanh toan khong?' });
    expect(invoiceResult.assistantMessage).toContain('Không có hóa đơn');
  });
});
