import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { getReturns, createReturn } from "../lib/returns";
import { createVerifiedSession } from "./helpers";

/**
 * Real backend-api, real Postgres, no mocks. ONE real signup for this
 * whole file (`beforeAll`) — see auth.spec.ts's own comment on why. Seeds
 * a real SKU → lot → order → invoice → payment through backend-api's own
 * real HTTP endpoints (this app is a pure HTTP client, never backend-api's
 * TS internals directly), same style as invoices.spec.ts.
 */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

let accessToken: string;

beforeAll(async () => {
  ({ accessToken } = await createVerifiedSession(adminSql, baseUrl, "returns"));
});

async function authedFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function seedPaidInvoicedOrder(): Promise<{ orderId: string; invoiceTotal: string }> {
  const sku = await authedFetch("/skus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skuCode: `SKU-RET-${Date.now()}`, name: "Test item", unit: "kg", unitPrice: "50000.00" }),
  });
  const lot = await authedFetch("/lots/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skuId: sku.id, lotCode: `LOT-RET-${Date.now()}`, quantity: "10" }),
  });
  const order = await authedFetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `wa-test-order-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ channel: "counter", lines: [{ skuId: sku.id, lotId: lot.id, quantity: "1", unitPrice: "50000.00" }] }),
  });
  const invoice = await authedFetch("/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `wa-test-invoice-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({ orderId: order.id }),
  });
  await authedFetch("/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId: invoice.id, method: "cash", amount: invoice.totalAmount }),
  });
  return { orderId: order.id, invoiceTotal: invoice.totalAmount };
}

describe("returns — real backend-api, real Postgres", () => {
  it("a fresh tenant has zero returns, then shows a real return after createReturn", async () => {
    expect(await getReturns(accessToken)).toEqual([]);

    const { orderId, invoiceTotal } = await seedPaidInvoicedOrder();
    const created = await createReturn(accessToken, { orderId, reason: "Test return", refundMethod: "cash" }, `wa-test-return-${Date.now()}-${Math.random()}`);

    expect(created.orderId).toBe(orderId);
    expect(created.refundAmount).toBe(invoiceTotal);
    expect(created.refundMethod).toBe("cash");
    expect(created.status).toBe("completed");

    const returns = await getReturns(accessToken);
    expect(returns).toHaveLength(1);
    expect(returns[0]!.id).toBe(created.id);
  });

  it("rejects a return with a missing refundMethod when the invoice was paid", async () => {
    const { orderId } = await seedPaidInvoicedOrder();

    await expect(createReturn(accessToken, { orderId, reason: "No method" }, `wa-test-return-missing-${Date.now()}-${Math.random()}`)).rejects.toThrow();
  });
});
