import { LoginForm } from "@/components/LoginForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export const metadata = {
  title: "Đăng nhập — SoloDesk Kế toán",
};

/**
 * A single centered card — same restrained shape as web-buyer-portal's
 * result card (no hero, no marketing copy — see
 * design-system/solodesk/pages/web-accounting.md's page-scope note).
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-md">
        <h1 className="mb-1 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-primary)]">SoloDesk</h1>
        <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">Đăng nhập để quản lý sổ sách kế toán.</p>

        <LoginForm />

        <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          hoặc
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <GoogleSignInButton />
      </div>
    </main>
  );
}
