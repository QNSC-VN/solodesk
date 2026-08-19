import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { getInvoices } from "../lib/invoices";
import { createVerifiedSession } from "./helpers";

/**
 * Real backend-api, real Postgres, no mocks. ONE real signup for this
 * whole file (`beforeAll`) — see auth.spec.ts's own comment on why. Seeds
 * a real SKU → lot → order → invoice through backend-api's own real HTTP
 * endpoints (this app is a pure HTTP client, never backend-api's TS
 * internals directly).
 */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

let accessToken: string;

beforeAll(async () => {
  ({ accessToken } = await createVerifiedSession(adminSql, baseUrl, "invoices"));
});

async function authedFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function seedIssuedInvoice(): Promise<{ invoiceNumber: string }> {
  const sku = await authedFetch("/skus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skuCode: `SKU-INV-${Date.now()}`, name: "Test item", unit: "kg", unitPrice: "50000.00" }),
  });
  await authedFetch("/lots/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skuId: sku.id, lotCode: `LOT-INV-${Date.now()}`, quantity: "10" }),
  });
  const order = await authedFetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `wa-test-order-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ channel: "counter", lines: [{ skuId: sku.id, quantity: "1" }] }),
  });
  return authedFetch("/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `wa-test-invoice-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ orderId: order.id }),
  });
}

describe("getInvoices — real backend-api, real Postgres", () => {
  it("a fresh tenant has zero invoices, then shows a real issued invoice", async () => {
    expect(await getInvoices(accessToken)).toEqual([]);

    const issued = await seedIssuedInvoice();

    const invoices = await getInvoices(accessToken);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.invoiceNumber).toBe(issued.invoiceNumber);
    expect(invoices[0]!.status).toBe("issued");
    expect(invoices[0]!.requiresEInvoice).toBe(false);
  });
});
