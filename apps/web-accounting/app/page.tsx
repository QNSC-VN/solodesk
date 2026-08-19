import { getDashboardContext } from "@/lib/dashboard-context";
import { getOrders } from "@/lib/orders";
import { formatVnd, formatDate } from "@/lib/format";
import { DashboardShell } from "@/components/DashboardShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import type { Order } from "@/lib/orders";

export const metadata = {
  title: "Đơn hàng — SoloDesk Kế toán",
};

const ORDER_COLUMNS: DataTableColumn<Order>[] = [
  { key: "createdAt", header: "Ngày", render: (o) => formatDate(o.createdAt) },
  { key: "channel", header: "Kênh", render: (o) => <StatusPill status={o.channel} /> },
  { key: "customerName", header: "Khách hàng", render: (o) => o.customerName ?? "—" },
  { key: "status", header: "Trạng thái", render: (o) => <StatusPill status={o.status} /> },
  { key: "totalAmount", header: "Tổng tiền", render: (o) => formatVnd(o.totalAmount), align: "right" },
];

/**
 * The orders list — same `DashboardShell`/`DataTable`/`StatusPill` shape
 * `app/invoices/page.tsx` and `app/stock/page.tsx` reuse verbatim.
 */
export default async function DashboardPage() {
  const { session, notifications, unreadCount } = await getDashboardContext();
  const orders = await getOrders(session.accessToken);

  return (
    <DashboardShell user={session.user} notifications={notifications} unreadCount={unreadCount}>
      <h1 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-foreground)]">Đơn hàng</h1>
      <DataTable
        columns={ORDER_COLUMNS}
        rows={orders}
        rowKey={(o) => o.id}
        emptyTitle="Chưa có đơn hàng"
        emptyBody="Đơn hàng của bạn sẽ hiển thị ở đây khi có đơn mới."
      />
    </DashboardShell>
  );
}
