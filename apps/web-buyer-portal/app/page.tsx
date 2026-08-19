import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-foreground)]">Quét mã QR trên sản phẩm</p>
        <p className="max-w-xs text-sm text-[var(--color-muted-foreground)]">để xem thông tin truy xuất nguồn gốc của lô hàng.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
