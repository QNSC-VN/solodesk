import { authenticatedJson } from "./backend-api-client";

export interface StockSummaryItem {
  skuId: string;
  skuCode: string;
  name: string;
  unit: string;
  category: string | null;
  unitPrice: string;
  isActive: boolean;
  totalOnHand: string;
  totalReserved: string;
  totalAvailable: string;
}

/** Calls backend-api's real `GET /v1/lots/stock-summary` — pure, testable against a real running backend-api. */
export async function getStockSummary(accessToken: string): Promise<StockSummaryItem[]> {
  return authenticatedJson<StockSummaryItem[]>(accessToken, "/lots/stock-summary");
}
