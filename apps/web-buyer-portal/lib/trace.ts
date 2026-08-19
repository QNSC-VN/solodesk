/**
 * Calls backend-api's real, public, unauthenticated GET /v1/trace/:lotId
 * (see services/backend-api/src/modules/traceability/api/trace.controller.ts —
 * @Public()/@SkipTenantContext(), "the page a buyer reaches by scanning a
 * QR code"). Extracted as a plain function, separate from the page
 * component, so it's directly testable without rendering React — same
 * reasoning as agent-orchestrator's searchByEmbedding split.
 */

export interface LotTrace {
  lotId: string;
  skuName: string;
  skuCategory: string;
  lotCode: string;
  sourceChannel: string | null;
  supplierName: string | null;
  receivedAt: string;
  publishedAt: string;
}

export class LotTraceNotFoundError extends Error {}

export async function getLotTrace(lotId: string): Promise<LotTrace> {
  const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
  const res = await fetch(`${baseUrl}/trace/${lotId}`, {
    // Public trace data changes rarely once published — a short revalidate
    // window avoids hammering backend-api on repeat QR scans of the same
    // lot without serving stale-forever either.
    next: { revalidate: 60 },
  });

  if (res.status === 404) {
    throw new LotTraceNotFoundError(`Lot ${lotId} not found or not published`);
  }
  if (!res.ok) {
    throw new Error(`backend-api returned ${res.status} for lot ${lotId}`);
  }

  return (await res.json()) as LotTrace;
}

/**
 * `sourceChannel` is a free string on the backend (see
 * traceability/domain/trace.types.ts's comment — no strict enum), not a
 * closed set this page can assume it knows every value of. Known values
 * get a real Vietnamese label; anything else falls back to a readable
 * title-cased version of the raw value, never the raw snake_case string
 * verbatim.
 */
const SOURCE_CHANNEL_LABELS: Record<string, string> = {
  purchase_note: "Nhập từ phiếu mua hàng",
  manual: "Nhập thủ công",
};

export function sourceChannelLabel(sourceChannel: string | null): string {
  if (!sourceChannel) return "Không rõ nguồn gốc";
  return (
    SOURCE_CHANNEL_LABELS[sourceChannel] ??
    sourceChannel
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}
