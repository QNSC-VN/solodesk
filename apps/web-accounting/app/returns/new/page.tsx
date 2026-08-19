import { notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getOrder } from "@/lib/orders";
import { formatVnd, formatDate } from "@/lib/format";
import { BackendApiError } from "@/lib/backend-api-client";
import { DashboardShell } from "@/components/DashboardShell";
import { ReturnForm } from "@/components/ReturnForm";

export const metadata = {
  title: "Trả hàng — SoloDesk Kế toán",
};

/**
 * Reached from the orders list's "Trả hàng" action link
 * (`?orderId=<id>`) — shows the order's own context (channel/customer/
 * total) before the staff member commits to an irreversible return,
 * rather than asking them to type/paste a raw order id blind.
 */
export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const { orderId } = await searchParams;
  const { session, notifications, unreadCount } = await getDashboardContext();

  if (!orderId) {
    notFound();
  }

  let order;
  try {
    order = await getOrder(session.accessToken, orderId);
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <DashboardShell user={session.user} notifications={notifications} unreadCount={unreadCount}>
      <h1 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-foreground)]">Trả hàng</h1>

      <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[var(--color-muted-foreground)]">Ngày đặt</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{formatDate(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted-foreground)]">Khách hàng</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{order.customerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted-foreground)]">Tổng tiền</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{formatVnd(order.totalAmount)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted-foreground)]">Số mặt hàng</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{order.lines.length}</dd>
          </div>
        </dl>
      </div>

      {order.status === "confirmed" ? (
        <ReturnForm orderId={order.id} />
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Đơn hàng này {order.status === "returned" ? "đã được trả trước đó" : "đã bị huỷ"}, không thể trả hàng.
        </p>
      )}
    </DashboardShell>
  );
}
