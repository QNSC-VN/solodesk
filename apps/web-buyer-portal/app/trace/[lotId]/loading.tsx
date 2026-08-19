import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TraceCardSkeleton } from "@/components/TraceCardSkeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-8">
        <TraceCardSkeleton />
      </main>
      <SiteFooter />
    </div>
  );
}
