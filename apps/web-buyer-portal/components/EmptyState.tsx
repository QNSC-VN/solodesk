/**
 * Reusable across all 3 planned apps — see MASTER.md's "Empty / Not-Found
 * State" spec. Never a blank screen: always an icon, a title, and a
 * plain-language explanation of what to do next.
 */

export interface EmptyStateProps {
  title: string;
  body: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 px-6 py-16 text-center text-[var(--color-muted-foreground)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-12 w-12 text-[var(--color-border)]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="font-[family-name:var(--font-heading)] font-semibold text-[var(--color-foreground)]">{title}</p>
      <p className="max-w-xs text-sm">{body}</p>
    </div>
  );
}
