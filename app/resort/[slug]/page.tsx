import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, MapPin, Mountain, ArrowUp, Cable } from "lucide-react";
import { getResortBySlug } from "@/lib/resorts-db";
import { ResortViewer } from "@/components/ResortViewer";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ResortPlaceholder } from "@/components/ResortPlaceholder";

// ISR: first request to each slug hits Neon; subsequent requests in the window
// serve the cached HTML. Resort metadata is near-static, so a long window is safe.
export const revalidate = 86400;

export default async function ResortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resort = await getResortBySlug(slug);
  if (!resort) notFound();

  return (
    <main className="pb-8">
      {/* Hero */}
      <section className="relative h-[55dvh] w-full overflow-hidden">
        {resort.image ? (
          <Image
            src={resort.image}
            alt={resort.name}
            fill
            sizes="540px"
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          <ResortPlaceholder seed={resort.slug} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/20" />
        <Link
          href="/"
          className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 grid place-items-center size-10 rounded-full bg-black/55 backdrop-blur text-white active:scale-95 transition"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <FavoriteButton
          slug={resort.slug}
          className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3"
        />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-12 text-white">
          <div className="flex items-center gap-1.5 text-xs font-medium opacity-90">
            <MapPin className="size-3.5" />
            <span>{resort.region ? `${resort.region} · ` : ""}{resort.country}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{resort.name}</h1>
        </div>
      </section>

      {/* Stat chips */}
      <section className="px-4 -mt-7 relative z-10">
        <div className="rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] shadow-xl px-4 py-3 grid grid-cols-3 divide-x divide-[color:var(--border)]">
          <Stat icon={<Mountain className="size-4" />} label="Peak" value={resort.elevationMax ? `${resort.elevationMax} m` : "—"} />
          <Stat icon={<ArrowUp className="size-4" />} label="Pistes" value={resort.runCount ? String(resort.runCount) : "—"} />
          <Stat icon={<Cable className="size-4" />} label="Lifts" value={resort.liftCount ? String(resort.liftCount) : "—"} />
        </div>
      </section>

      {/* Map */}
      <section className="px-4 mt-5">
        <ResortViewer resort={resort} />
      </section>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-2">
      <div className="text-[color:var(--muted-foreground)] flex items-center gap-1 text-[11px] uppercase tracking-wide font-medium">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
