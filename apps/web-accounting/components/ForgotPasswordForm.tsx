"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type ForgotPasswordActionState } from "@/app/forgot-password/actions";

const INITIAL_STATE: ForgotPasswordActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, INITIAL_STATE);

  if (state.submitted) {
    return (
      <p role="status" className="text-sm text-[var(--color-foreground)]">
        Nếu email đó có tài khoản, chúng tôi đã gửi một email hướng dẫn đặt lại mật khẩu.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-[var(--color-foreground)]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={state.error ? "forgot-password-error" : undefined}
          className="input rounded-lg border border-[var(--color-border)] px-4 py-3 text-base transition-colors duration-150 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/20"
        />
      </div>

      {state.error && (
        <p id="forgot-password-error" role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary cursor-pointer rounded-lg bg-[var(--color-accent)] px-6 py-3 font-semibold text-[var(--color-on-accent)] transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Đang gửi…" : "Gửi liên kết đặt lại mật khẩu"}
      </button>
    </form>
  );
}
