import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { EmptyState } from "@/components/EmptyState";

export default function TraceNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4">
        <EmptyState title="Không tìm thấy lô hàng" body="Mã QR này không khớp với lô hàng nào đã công bố. Vui lòng kiểm tra lại mã hoặc liên hệ người bán." />
      </main>
      <SiteFooter />
    </div>
  );
}
