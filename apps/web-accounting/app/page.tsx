import { requireSession } from "@/lib/session";
import { getOrders } from "@/lib/orders";
import { getNotifications, getUnreadCount } from "@/lib/notifications";
import { DashboardShell } from "@/components/DashboardShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import type { Order } from "@/lib/orders";

export const metadata = {
  title: "Đơn hàng — SoloDesk Kế toán",
};

function formatVnd(amount: string): string {
  return `${Number(amount).toLocaleString("vi-VN")} đ`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

const ORDER_COLUMNS: DataTableColumn<Order>[] = [
  { key: "createdAt", header: "Ngày", render: (o) => formatDate(o.createdAt) },
  { key: "channel", header: "Kênh", render: (o) => <StatusPill status={o.channel} /> },
  { key: "customerName", header: "Khách hàng", render: (o) => o.customerName ?? "—" },
  { key: "status", header: "Trạng thái", render: (o) => <StatusPill status={o.status} /> },
  { key: "totalAmount", header: "Tổng tiền", render: (o) => formatVnd(o.totalAmount), align: "right" },
];

/**
 * Dashboard shell + ONE real data screen (orders) — proves the whole shape
 * (auth, layout, real data, status pills) end to end. Invoices/stock pages
 * reuse this exact DashboardShell/DataTable later — documented scope cut,
 * see design-system/solodesk/pages/web-accounting.md.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const [orders, notifications, unreadCount] = await Promise.all([
    getOrders(session.accessToken),
    getNotifications(session.accessToken),
    getUnreadCount(session.accessToken),
  ]);

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
