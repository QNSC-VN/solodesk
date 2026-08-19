type Variant = "success" | "pending" | "neutral" | "error";

/** Domain status → Master's badge variant. The one place this mapping lives — reused by orders/invoices/notifications, never a 5th ad hoc color. */
const STATUS_VARIANTS: Record<string, Variant> = {
  // orders
  confirmed: "success",
  pending: "pending",
  cancelled: "error",
  // notifications / generic
  read: "neutral",
  unread: "pending",
};

function labelFor(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const variant = STATUS_VARIANTS[status] ?? "neutral";
  return (
    <span role="status" aria-atomic="true" className={`badge badge-${variant}`}>
      <span className="badge-text">{label ?? labelFor(status)}</span>
    </span>
  );
}
