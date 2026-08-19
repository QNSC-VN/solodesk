import { authenticatedJson } from "./backend-api-client";

export interface OrderLine {
  id: string;
  skuId: string;
  lotId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Order {
  id: string;
  channel: string;
  status: string;
  customerName: string | null;
  totalAmount: string;
  createdAt: string;
  lines: OrderLine[];
}

/** Calls backend-api's real `GET /v1/orders` — pure, testable against a real running backend-api. */
export async function getOrders(accessToken: string): Promise<Order[]> {
  return authenticatedJson<Order[]>(accessToken, "/orders");
}
