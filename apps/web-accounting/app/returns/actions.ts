"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccessToken } from "@/lib/session";
import { createReturn, type RefundMethod } from "@/lib/returns";
import { BackendApiError } from "@/lib/backend-api-client";

export interface CreateReturnActionState {
  error?: string;
}

const REFUND_METHODS: RefundMethod[] = ["cash", "bank_transfer", "qr", "marketplace_settlement"];

export async function createReturnAction(_prevState: CreateReturnActionState, formData: FormData): Promise<CreateReturnActionState> {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const refundMethodRaw = String(formData.get("refundMethod") ?? "");
  const refundMethod = REFUND_METHODS.includes(refundMethodRaw as RefundMethod) ? (refundMethodRaw as RefundMethod) : undefined;
  const confirmed = formData.get("confirmed") === "on";

  if (!orderId) {
    return { error: "Thiếu mã đơn hàng." };
  }
  if (!reason) {
    return { error: "Vui lòng nhập lý do trả hàng." };
  }
  if (!confirmed) {
    return { error: "Vui lòng xác nhận trả hàng — thao tác này không thể hoàn tác." };
  }

  try {
    await createReturn(accessToken, { orderId, reason, ...(refundMethod ? { refundMethod } : {}) }, randomUUID());
  } catch (err) {
    if (err instanceof BackendApiError) {
      if (err.code === "REFUND_METHOD_REQUIRED") {
        return { error: "Đơn hàng này đã được thanh toán — vui lòng chọn phương thức hoàn tiền." };
      }
      if (err.code === "ORDER_NOT_RETURNABLE") {
        return { error: "Đơn hàng này không thể trả (đã trả hàng hoặc đã huỷ trước đó)." };
      }
      if (err.code === "NO_INVOICE_TO_RETURN") {
        return { error: "Đơn hàng này chưa có hóa đơn, không thể trả hàng." };
      }
    }
    return { error: "Đã có lỗi xảy ra. Vui lòng thử lại." };
  }

  revalidatePath("/returns");
  revalidatePath("/");
  redirect("/returns?created=1");
}
