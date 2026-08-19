"use client";

import { useActionState } from "react";
import { createReturnAction, type CreateReturnActionState } from "@/app/returns/actions";

const INITIAL_STATE: CreateReturnActionState = {};

const REFUND_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Không cần hoàn tiền (đơn chưa thanh toán)" },
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "qr", label: "QR" },
  { value: "marketplace_settlement", label: "Đối soát sàn" },
];

export function ReturnForm({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState(createReturnAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orderId" value={orderId} />

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-sm font-medium text-[var(--color-foreground)]">
          Lý do trả hàng
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          aria-describedby={state.error ? "return-form-error" : undefined}
          className="input rounded-lg border border-[var(--color-border)] px-4 py-3 text-base transition-colors duration-150 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/20"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="refundMethod" className="text-sm font-medium text-[var(--color-foreground)]">
          Phương thức hoàn tiền
        </label>
        <select
          id="refundMethod"
          name="refundMethod"
          className="input rounded-lg border border-[var(--color-border)] px-4 py-3 text-base transition-colors duration-150 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/20"
        >
          {REFUND_METHOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-[var(--color-muted-foreground)]">Chỉ bắt buộc nếu đơn hàng đã được thanh toán trước đó.</p>
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--color-foreground)]">
        <input type="checkbox" name="confirmed" required className="mt-1" />
        <span>Tôi xác nhận muốn trả đơn hàng này — thao tác này sẽ hoàn lại hàng vào kho, huỷ hóa đơn, và không thể hoàn tác.</span>
      </label>

      {state.error && (
        <p id="return-form-error" role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary cursor-pointer self-start rounded-lg bg-[var(--color-accent)] px-6 py-3 font-semibold text-[var(--color-on-accent)] transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Đang xử lý…" : "Xác nhận trả hàng"}
      </button>
    </form>
  );
}
