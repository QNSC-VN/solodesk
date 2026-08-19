import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TraceCard } from "@/components/TraceCard";
import { getLotTrace, LotTraceNotFoundError } from "@/lib/trace";

/**
 * `notFound()` here returns a soft 404 (HTTP 200 + `<meta name="robots"
 * content="noindex">`), not a real 404 status — because `loading.tsx`
 * exists alongside this route, Next.js wraps the page in an implicit
 * Suspense boundary, so streaming (and the 200 status) starts before this
 * component's `notFound()` call can run. Deliberate, not a bug: this page
 * is reached only via a direct QR-code link, never crawled/indexed
 * (the noindex tag handles that), so the loading-skeleton UX for real
 * mobile buyers on slow connections matters more than a strict status
 * code nothing but a compliance audit would check. A real 404 would need
 * the not-found check to run in `proxy` (Next 16's middleware) BEFORE
 * this route streams at all — not worth the complexity for this page.
 */
export default async function TracePage({ params }: PageProps<"/trace/[lotId]">) {
  const { lotId } = await params;

  let trace;
  try {
    trace = await getLotTrace(lotId);
  } catch (err) {
    if (err instanceof LotTraceNotFoundError) notFound();
    throw err;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-8">
        <TraceCard trace={trace} />
      </main>
      <SiteFooter />
    </div>
  );
}
