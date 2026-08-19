/**
 * Shaped exactly like TraceCard so the real card doesn't shift layout
 * (CLS) when it streams in — see MASTER.md's Loading State spec.
 */
export function TraceCardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-[var(--color-card)] p-6 shadow-md">
      <div className="skeleton h-6 w-32 rounded-full" />
      <div className="skeleton mt-4 h-7 w-48" />
      <div className="skeleton mt-2 h-4 w-36" />
      <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-full" />
      </div>
    </div>
  );
}
