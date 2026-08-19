import { Badge } from "./Badge";
import { formatDate } from "@/lib/format";
import { sourceChannelLabel, type LotTrace } from "@/lib/trace";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="truncate text-right text-sm font-medium text-[var(--color-card-foreground)]">{value}</dd>
    </div>
  );
}

export function TraceCard({ trace }: { trace: LotTrace }) {
  return (
    <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-[var(--color-card)] p-6 shadow-md">
      <Badge tone="success">Lô hàng đã xác minh</Badge>

      <h1 className="mt-4 font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--color-card-foreground)]">{trace.skuName}</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {trace.skuCategory} · {trace.lotCode}
      </p>

      <dl className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {trace.supplierName && <Row label="Nhà cung cấp" value={trace.supplierName} />}
        <Row label="Nguồn gốc" value={sourceChannelLabel(trace.sourceChannel)} />
        <Row label="Ngày nhận hàng" value={formatDate(trace.receivedAt)} />
        <Row label="Ngày công bố" value={formatDate(trace.publishedAt)} />
      </dl>
    </div>
  );
}
