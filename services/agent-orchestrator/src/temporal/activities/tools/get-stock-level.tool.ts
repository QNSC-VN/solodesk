import { eq, and, sql as sqlOp } from 'drizzle-orm';
import { db } from '../../../db/client';
import { skus } from '../../../db/schema/skus';
import { lots } from '../../../db/schema/lots';
import { withTenantTransaction } from '../../../platform/tenant-db';

export interface GetStockLevelInput {
  tenantId: string;
  skuCode: string;
}

export type GetStockLevelResult = { found: false; skuCode: string } | { found: true; skuCode: string; skuName: string; quantityAvailable: string };

export const GET_STOCK_LEVEL_TOOL_NAME = 'get_stock_level';

/**
 * The first Layer A tool with a CALLER-SUPPLIED argument (`get_sales_summary`
 * takes none at all) — `skuCode` is the one thing the model may specify;
 * `tenantId` is never part of the exposed schema and never comes from the
 * model, always threaded in from the workflow's own argument chain back to
 * the caller's JWT (same discipline as every other tool/module in this
 * codebase). Still `additionalProperties: false` — no way to smuggle a
 * second, unexpected argument through.
 */
export const getStockLevelToolSchema = {
  name: GET_STOCK_LEVEL_TOOL_NAME,
  description: "Get the current available quantity (on hand minus reserved) for one of the caller's own SKUs, by its exact SKU code. Read-only.",
  input_schema: {
    type: 'object' as const,
    properties: {
      skuCode: { type: 'string' as const, description: 'The exact SKU code to look up, e.g. "SKU-001".' },
    },
    required: ['skuCode'],
    additionalProperties: false,
  },
};

export async function getStockLevel(input: GetStockLevelInput): Promise<GetStockLevelResult> {
  return withTenantTransaction(db, input.tenantId, async (tx) => {
    const skuRows = await tx
      .select()
      .from(skus)
      .where(and(eq(skus.tenantId, input.tenantId), eq(skus.skuCode, input.skuCode)))
      .limit(1);
    const sku = skuRows[0];
    if (!sku) {
      return { found: false, skuCode: input.skuCode };
    }

    const lotRows = await tx
      .select({
        totalOnHand: sqlOp<string>`COALESCE(SUM(${lots.quantityOnHand}), 0)`,
        totalReserved: sqlOp<string>`COALESCE(SUM(${lots.quantityReserved}), 0)`,
      })
      .from(lots)
      .where(and(eq(lots.tenantId, input.tenantId), eq(lots.skuId, sku.id)));

    const row = lotRows[0]!;
    const quantityAvailable = (Number(row.totalOnHand) - Number(row.totalReserved)).toString();

    return { found: true, skuCode: sku.skuCode, skuName: sku.name, quantityAvailable };
  });
}
