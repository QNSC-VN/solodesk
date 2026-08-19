import { eq, and, gte, sql as sqlOp } from 'drizzle-orm';
import { db } from '../../../db/client';
import { orders } from '../../../db/schema/orders';
import { withTenantTransaction } from '../../../platform/tenant-db';

export interface GetSalesSummaryInput {
  tenantId: string;
}

export interface GetSalesSummaryResult {
  date: string;
  orderCount: number;
  totalAmount: string;
}

export const GET_SALES_SUMMARY_TOOL_NAME = 'get_sales_summary';

/**
 * Strict JSON schema, `additionalProperties: false`, zero free-form
 * parameters — the docs Section 5.1 "constrained tool-calling, never
 * free-form SQL generation" discipline made concrete. This tool takes NO
 * caller-supplied arguments at all (tenantId comes from the workflow's own
 * context, never from the model) — the smallest possible attack surface
 * for a first Layer A tool.
 */
export const getSalesSummaryToolSchema = {
  name: GET_SALES_SUMMARY_TOOL_NAME,
  description: "Get the count and total amount (VND) of today's confirmed sales orders for the caller's own tenant. Read-only, no arguments.",
  input_schema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
};

function startOfTodayVietnam(): Date {
  // Vietnam is UTC+7, no DST — same discipline as connector-hub's SePay
  // webhook date parsing. Using UTC midnight directly would misclassify
  // every order placed between 00:00-07:00 Vietnam time as "yesterday."
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  const vnMidnightAsUtc = Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate());
  return new Date(vnMidnightAsUtc - VN_OFFSET_MS);
}

export async function getSalesSummary(input: GetSalesSummaryInput): Promise<GetSalesSummaryResult> {
  const startOfToday = startOfTodayVietnam();

  return withTenantTransaction(db, input.tenantId, async (tx) => {
    const rows = await tx
      .select({
        orderCount: sqlOp<string>`COUNT(*)`,
        totalAmount: sqlOp<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, input.tenantId), eq(orders.status, 'confirmed'), gte(orders.createdAt, startOfToday)));

    const row = rows[0]!;
    return {
      date: startOfToday.toISOString().slice(0, 10),
      orderCount: Number(row.orderCount),
      totalAmount: row.totalAmount,
    };
  });
}
