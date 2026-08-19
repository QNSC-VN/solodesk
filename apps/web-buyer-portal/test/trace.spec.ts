import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { getLotTrace, LotTraceNotFoundError, sourceChannelLabel } from "../lib/trace";
import { formatDate } from "../lib/format";

/**
 * Real backend-api, real Postgres, no mocks — same "real, no mocks"
 * philosophy as every other service's e2e specs in this repo. This app
 * has no DB role of its own (it only ever calls backend-api's public
 * GET /v1/trace/:lotId over HTTP), so DATABASE_ADMIN_URL here is
 * TEST-FIXTURE-SEEDING ONLY, mirroring the exact shape
 * TraceabilityService.publishLotTrace produces — never something the
 * running app itself connects with.
 */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

async function seedPublishedLot(overrides: { supplierName?: string | null } = {}) {
  const marker = `WEB-TEST-${Date.now()}`;
  const [tenant] = await adminSql`INSERT INTO identity.tenants (legal_name, industry) VALUES (${marker}, 'food_beverage') RETURNING id`;
  const [sku] = await adminSql`
    INSERT INTO catalog.skus (tenant_id, sku_code, name, unit, category, unit_price)
    VALUES (${tenant.id}, ${marker}, 'Ca phe Arabica', 'kg', 'coffee', '150000.00')
    RETURNING id
  `;
  const [lot] = await adminSql`
    INSERT INTO catalog.lots (tenant_id, sku_id, lot_code, quantity_on_hand, source_channel)
    VALUES (${tenant.id}, ${sku.id}, ${marker}, '30.000', 'purchase_note')
    RETURNING id, received_at
  `;
  await adminSql`
    INSERT INTO traceability.lot_traces (lot_id, tenant_id, sku_name, sku_category, lot_code, source_channel, supplier_name, received_at)
    VALUES (${lot.id}, ${tenant.id}, 'Ca phe Arabica', 'coffee', ${marker}, 'purchase_note', ${overrides.supplierName === undefined ? "Nong Trai Test" : overrides.supplierName}, ${lot.received_at})
  `;
  return { lotId: lot.id as string, lotCode: marker };
}

describe("getLotTrace — real backend-api, real Postgres", () => {
  it("returns real published lot data", async () => {
    const { lotId, lotCode } = await seedPublishedLot();

    const trace = await getLotTrace(lotId);

    expect(trace.skuName).toBe("Ca phe Arabica");
    expect(trace.lotCode).toBe(lotCode);
    expect(trace.supplierName).toBe("Nong Trai Test");
    expect(trace.sourceChannel).toBe("purchase_note");
  });

  it("a lot with no supplier (manual receive) comes back with supplierName null", async () => {
    const { lotId } = await seedPublishedLot({ supplierName: null });

    const trace = await getLotTrace(lotId);

    expect(trace.supplierName).toBeNull();
  });

  it("throws LotTraceNotFoundError for a lot that was never published", async () => {
    await expect(getLotTrace("00000000-0000-0000-0000-000000000000")).rejects.toThrow(LotTraceNotFoundError);
  });
});

describe("sourceChannelLabel", () => {
  it("maps known channels to real Vietnamese labels", () => {
    expect(sourceChannelLabel("purchase_note")).toBe("Nhập từ phiếu mua hàng");
  });

  it("falls back to a readable title-cased label for an unknown channel, never the raw string", () => {
    expect(sourceChannelLabel("some_new_channel")).toBe("Some New Channel");
  });

  it("handles null as no-source-channel", () => {
    expect(sourceChannelLabel(null)).toBe("Không rõ nguồn gốc");
  });
});

describe("formatDate", () => {
  it("formats an ISO date in vi-VN order", () => {
    expect(formatDate("2026-08-19T05:35:54.602Z")).toBe("19/08/2026");
  });
});
