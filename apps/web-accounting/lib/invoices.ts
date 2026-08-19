import { authenticatedJson } from "./backend-api-client";

export interface Invoice {
  id: string;
  orderId: string;
  invoiceNumber: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  requiresEInvoice: boolean;
  status: string;
  issuedAt: string;
}

/** Calls backend-api's real `GET /v1/invoices` — pure, testable against a real running backend-api. */
export async function getInvoices(accessToken: string): Promise<Invoice[]> {
  return authenticatedJson<Invoice[]>(accessToken, "/invoices");
}
