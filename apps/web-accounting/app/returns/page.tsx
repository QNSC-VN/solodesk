import { getDashboardContext } from "@/lib/dashboard-context";
import { getReturns } from "@/lib/returns";
import { formatVnd, formatDate } from "@/lib/format";
import { DashboardShell } from "@/components/DashboardShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import type { Return } from "@/lib/returns";

export const metadata = {
  title: "Trả hàng — SoloDesk Kế toán",
};

const RETURN_COLUMNS: DataTableColumn<Return>[] = [
  { key: "createdAt", header: "Ngày", render: (r) => formatDate(r.createdAt) },
  { key: "reason", header: "Lý do", render: (r) => r.reason },
  { key: "refundMethod", header: "Hoàn tiền", render: (r) => (r.refundMethod ? <StatusPill status={r.refundMethod} /> : "—") },
  { key: "refundAmount", header: "Số tiền hoàn", render: (r) => formatVnd(r.refundAmount), align: "right" },
  { key: "status", header: "Trạng thái", render: (r) => <StatusPill status={r.status} /> },
];

/**
 * Read-only list — creating a return starts from the orders page's "Trả
 * hàng" action link (`/returns/new?orderId=<id>`), not from here, so a
 * return is always created with real order context in view, never a
 * blind id.
 */
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const { session, notifications, unreadCount } = await getDashboardContext();
  const returns = await getReturns(session.accessToken);

  return (
    <DashboardShell user={session.user} notifications={notifications} unreadCount={unreadCount}>
      <h1 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-foreground)]">Trả hàng</h1>

      {created === "1" && (
        <p role="status" className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2 text-sm text-[var(--color-foreground)]">
          Đã trả hàng thành công.
        </p>
      )}

      <DataTable
        columns={RETURN_COLUMNS}
        rows={returns}
        rowKey={(r) => r.id}
        emptyTitle="Chưa có đơn trả hàng"
        emptyBody="Chọn “Trả hàng” trên một đơn hàng để bắt đầu."
      />
    </DashboardShell>
  );
}
