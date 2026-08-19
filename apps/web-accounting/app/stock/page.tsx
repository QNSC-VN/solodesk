import { getDashboardContext } from "@/lib/dashboard-context";
import { getStockSummary } from "@/lib/stock";
import { formatVnd } from "@/lib/format";
import { DashboardShell } from "@/components/DashboardShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import type { StockSummaryItem } from "@/lib/stock";

export const metadata = {
  title: "Kho hàng — SoloDesk Kế toán",
};

const STOCK_COLUMNS: DataTableColumn<StockSummaryItem>[] = [
  { key: "skuCode", header: "Mã SKU", render: (s) => s.skuCode },
  { key: "name", header: "Tên sản phẩm", render: (s) => s.name },
  { key: "unit", header: "Đơn vị", render: (s) => s.unit },
  { key: "totalOnHand", header: "Tồn kho", render: (s) => s.totalOnHand, align: "right" },
  { key: "totalReserved", header: "Đã giữ", render: (s) => s.totalReserved, align: "right" },
  { key: "totalAvailable", header: "Có thể bán", render: (s) => s.totalAvailable, align: "right" },
  { key: "unitPrice", header: "Đơn giá", render: (s) => formatVnd(s.unitPrice), align: "right" },
  { key: "isActive", header: "Trạng thái", render: (s) => <StatusPill status={s.isActive ? "confirmed" : "cancelled"} label={s.isActive ? "Đang bán" : "Ngừng bán"} /> },
];

/** Same `DashboardShell`/`DataTable`/`StatusPill` shape as `app/page.tsx`'s orders list. */
export default async function StockPage() {
  const { session, notifications, unreadCount } = await getDashboardContext();
  const stock = await getStockSummary(session.accessToken);

  return (
    <DashboardShell user={session.user} notifications={notifications} unreadCount={unreadCount}>
      <h1 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-foreground)]">Kho hàng</h1>
      <DataTable
        columns={STOCK_COLUMNS}
        rows={stock}
        rowKey={(s) => s.skuId}
        emptyTitle="Chưa có sản phẩm"
        emptyBody="Sản phẩm sẽ hiển thị ở đây khi bạn thêm SKU đầu tiên."
      />
    </DashboardShell>
  );
}
