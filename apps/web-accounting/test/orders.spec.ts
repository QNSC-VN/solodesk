import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { getOrders } from "../lib/orders";
import { createVerifiedSession } from "./helpers";

/** Real backend-api, real Postgres, no mocks — same discipline as web-buyer-portal/test/trace.spec.ts. */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

describe("getOrders — real backend-api, real Postgres", () => {
  it("returns the caller tenant's real seeded orders", async () => {
    const { accessToken, tenantId } = await createVerifiedSession(adminSql, baseUrl, "orders-ok");
    await adminSql`
      INSERT INTO sales.orders (tenant_id, channel, status, total_amount, created_at, updated_at)
      VALUES (${tenantId}, 'counter', 'confirmed', '250000.00', now(), now())
    `;

    const orders = await getOrders(accessToken);

    expect(orders).toHaveLength(1);
    expect(orders[0]!.channel).toBe("counter");
    expect(orders[0]!.status).toBe("confirmed");
    expect(orders[0]!.totalAmount).toBe("250000.00");
    expect(orders[0]!.createdAt).toBeTruthy();
    expect(Array.isArray(orders[0]!.lines)).toBe(true);
  });

  it("a tenant with zero orders gets an empty array, not an error", async () => {
    const { accessToken } = await createVerifiedSession(adminSql, baseUrl, "orders-empty");

    const orders = await getOrders(accessToken);

    expect(orders).toEqual([]);
  });
});
