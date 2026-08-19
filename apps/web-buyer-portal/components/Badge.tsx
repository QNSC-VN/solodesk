/**
 * Reusable across all 3 planned SoloDesk Next.js apps (buyer-portal,
 * accounting, b2g-dashboard) — see /design-system/solodesk/MASTER.md's
 * "Status Pill / Badge" spec. Per that spec's --domain ux guidance: the
 * label never wraps (truncates instead), and an async-updating badge
 * announces via one atomic role="status" message rather than a bare
 * live-region number — callers that update a badge's text after mount
 * should pass `live` so screen readers get one clean announcement.
 */

export type BadgeTone = "success" | "pending" | "neutral" | "error";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]",
  pending: "bg-[var(--badge-pending-bg)] text-[var(--badge-pending-fg)]",
  neutral: "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]",
  error: "bg-[var(--badge-error-bg)] text-[var(--badge-error-fg)]",
};

export interface BadgeProps {
  tone: BadgeTone;
  children: string;
  live?: boolean;
}

export function Badge({ tone, children, live = false }: BadgeProps) {
  return (
    <span
      {...(live ? { role: "status", "aria-atomic": true } : {})}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold leading-tight ${TONE_CLASSES[tone]}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
