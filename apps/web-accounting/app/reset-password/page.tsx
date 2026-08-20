import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata = {
  title: "Đặt lại mật khẩu — SoloDesk Kế toán",
};

/**
 * Reached from the emailed reset link
 * (`WEB_ACCOUNTING_PUBLIC_URL`/reset-password?token=... — see backend-api's
 * signup.service.ts and env.schema.ts). Token validity (unused, unexpired)
 * is checked server-side by `POST /v1/auth/reset-password` itself on
 * submit, not here — no reason to spend a real HTTP round-trip just to
 * pre-validate a token the form submit will validate anyway.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-md">
        <h1 className="mb-1 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-primary)]">Đặt lại mật khẩu</h1>

        {token ? (
          <>
            <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">Nhập mật khẩu mới cho tài khoản của bạn.</p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            Liên kết không hợp lệ.{" "}
            <a href="/forgot-password" className="font-medium underline">
              Yêu cầu liên kết mới
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
