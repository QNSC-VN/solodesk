"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetPasswordActionState } from "@/app/reset-password/actions";

const INITIAL_STATE: ResetPasswordActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1">
        <label htmlFor="newPassword" className="text-sm font-medium text-[var(--color-foreground)]">
          Mật khẩu mới
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby={state.error ? "reset-password-error" : undefined}
          className="input rounded-lg border border-[var(--color-border)] px-4 py-3 text-base transition-colors duration-150 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/20"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-[var(--color-foreground)]">
          Xác nhận mật khẩu mới
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input rounded-lg border border-[var(--color-border)] px-4 py-3 text-base transition-colors duration-150 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/20"
        />
      </div>

      {state.error && (
        <p id="reset-password-error" role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary cursor-pointer rounded-lg bg-[var(--color-accent)] px-6 py-3 font-semibold text-[var(--color-on-accent)] transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Đang cập nhật…" : "Đặt lại mật khẩu"}
      </button>
    </form>
  );
}
