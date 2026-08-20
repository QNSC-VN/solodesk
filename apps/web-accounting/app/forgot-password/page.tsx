import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata = {
  title: "Quên mật khẩu — SoloDesk Kế toán",
};

/** Same centered-card shape as /login — this page and /reset-password are the only two unauthenticated pages besides it, see proxy.ts. */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-md">
        <h1 className="mb-1 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-primary)]">Quên mật khẩu</h1>
        <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">Nhập email đăng nhập, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>

        <ForgotPasswordForm />

        <a href="/login" className="mt-6 block text-center text-sm font-medium text-[var(--color-primary)] hover:underline">
          Quay lại đăng nhập
        </a>
      </div>
    </main>
  );
}
