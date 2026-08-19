import { authenticatedJson } from "./backend-api-client";

export type RefundMethod = "cash" | "bank_transfer" | "qr" | "marketplace_settlement";

export interface Return {
  id: string;
  orderId: string;
  invoiceId: string;
  reason: string;
  refundAmount: string;
  refundMethod: RefundMethod | null;
  status: string;
  createdAt: string;
}

/** Calls backend-api's real `GET /v1/returns` — pure, testable against a real running backend-api. */
export async function getReturns(accessToken: string): Promise<Return[]> {
  return authenticatedJson<Return[]>(accessToken, "/returns");
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  refundMethod?: RefundMethod;
}

/**
 * Calls backend-api's real `POST /v1/returns`. `idempotencyKey` is required
 * by that endpoint (Mục 5.2 — same convention as orders/invoices) — the
 * caller (the Server Action) generates a fresh one per real submit attempt.
 */
export async function createReturn(accessToken: string, input: CreateReturnInput, idempotencyKey: string): Promise<Return> {
  return authenticatedJson<Return>(accessToken, "/returns", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}
