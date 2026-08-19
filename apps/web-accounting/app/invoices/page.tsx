import { getDashboardContext } from "@/lib/dashboard-context";
import { getInvoices } from "@/lib/invoices";
import { formatVnd, formatDate } from "@/lib/format";
import { DashboardShell } from "@/components/DashboardShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import type { Invoice } from "@/lib/invoices";

export const metadata = {
  title: "Hóa đơn — SoloDesk Kế toán",
};

const INVOICE_COLUMNS: DataTableColumn<Invoice>[] = [
  { key: "issuedAt", header: "Ngày phát hành", render: (i) => formatDate(i.issuedAt) },
  { key: "invoiceNumber", header: "Số hóa đơn", render: (i) => i.invoiceNumber },
  { key: "status", header: "Trạng thái", render: (i) => <StatusPill status={i.status} /> },
  {
    key: "requiresEInvoice",
    header: "Hóa đơn điện tử",
    render: (i) => <StatusPill status={i.requiresEInvoice ? "required" : "not_required"} label={i.requiresEInvoice ? "Bắt buộc" : "Không bắt buộc"} />,
  },
  { key: "totalAmount", header: "Tổng tiền", render: (i) => formatVnd(i.totalAmount), align: "right" },
];

/** Same `DashboardShell`/`DataTable`/`StatusPill` shape as `app/page.tsx`'s orders list. */
export default async function InvoicesPage() {
  const { session, notifications, unreadCount } = await getDashboardContext();
  const invoices = await getInvoices(session.accessToken);

  return (
    <DashboardShell user={session.user} notifications={notifications} unreadCount={unreadCount}>
      <h1 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-foreground)]">Hóa đơn</h1>
      <DataTable
        columns={INVOICE_COLUMNS}
        rows={invoices}
        rowKey={(i) => i.id}
        emptyTitle="Chưa có hóa đơn"
        emptyBody="Hóa đơn sẽ hiển thị ở đây khi được phát hành từ một đơn hàng."
      />
    </DashboardShell>
  );
}
