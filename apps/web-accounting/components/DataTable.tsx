import { EmptyState } from "./EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle: string;
  emptyBody: string;
}

/**
 * The one table component every future data page (orders now; invoices/
 * stock later — not built in this first cut, see
 * design-system/solodesk/pages/web-accounting.md) reuses. `data-dense-
 * dashboard`'s structural values (`--table-row-height`, sticky header,
 * 12-14px font) — see that style's own spec, confirmed Light Mode
 * supported.
 *
 * Interactive client-side sorting is a documented scope cut for this first
 * cut (would need a Client Component wrapper + state — real, but not
 * needed to prove the shape end to end); rows render in whatever order the
 * caller's data already comes back in.
 */
export function DataTable<T>({ columns, rows, rowKey, emptyTitle, emptyBody }: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <EmptyState title={emptyTitle} body={emptyBody} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--color-muted)] text-[var(--font-size-small)] uppercase tracking-wide text-[var(--color-muted-foreground)]">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2 font-semibold ${col.align === "right" ? "text-right" : "text-left"}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]" style={{ height: "var(--table-row-height)" }}>
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2 ${col.align === "right" ? "text-right" : "text-left"}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
