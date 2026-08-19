import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { getStockSummary } from "../lib/stock";
import { createVerifiedSession } from "./helpers";

/**
 * Real backend-api, real Postgres, no mocks. ONE real signup for this
 * whole file (`beforeAll`) — see auth.spec.ts's own comment on why.
 */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

let accessToken: string;

beforeAll(async () => {
  ({ accessToken } = await createVerifiedSession(adminSql, baseUrl, "stock"));
});

async function authedFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

describe("getStockSummary — real backend-api, real Postgres", () => {
  it("a fresh tenant has zero SKUs, then shows real SKU catalog data combined with real aggregated stock quantity", async () => {
    expect(await getStockSummary(accessToken)).toEqual([]);

    const skuCode = `SKU-STOCK-WA-${Date.now()}`;
    const sku = await authedFetch("/skus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skuCode, name: "Ca phe rang xay", unit: "kg", unitPrice: "180000.00" }),
    });
    await authedFetch("/lots/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skuId: sku.id, lotCode: `LOT-STOCK-WA-${Date.now()}`, quantity: "15" }),
    });

    const stock = await getStockSummary(accessToken);
    expect(stock).toHaveLength(1);
    expect(stock[0]!.skuCode).toBe(skuCode);
    expect(stock[0]!.totalOnHand).toBe("15.000");
    expect(stock[0]!.totalAvailable).toBe("15.000");
    expect(stock[0]!.isActive).toBe(true);
  });
});
