import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, MapPin, Mountain, ArrowUp, Cable } from "lucide-react";
import { getResortBySlug } from "@/lib/resorts/queries";
import { getResortConditions } from "@/lib/conditions/queries";
import type { ResortConditions } from "@/db/schema";
import { ResortViewer } from "@/components/ResortViewer";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ActiveResortButton } from "@/components/ActiveResortButton";
import { ResortPlaceholder } from "@/components/ResortPlaceholder";

// ISR window is short here because live conditions (lifts open, snow depth)
// share this page. Static metadata is unchanged but we accept the extra
// regenerations so the conditions card doesn't go stale by a full day.
export const revalidate = 600;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const resort = await getResortBySlug(slug);
  if (!resort) return { title: "Resort not found — Schuss" };

  const where = [resort.region, resort.country].filter(Boolean).join(", ");
  const title = `${resort.name}${where ? `, ${where}` : ""} — Schuss`;
  const stats: string[] = [];
  if (resort.runCount) stats.push(`${resort.runCount} pistes`);
  if (resort.liftCount) stats.push(`${resort.liftCount} lifts`);
  if (resort.elevationMax) stats.push(`up to ${Math.round(resort.elevationMax)} m`);
  const description = stats.length
    ? `${stats.join(" · ")}. Explore ${resort.name} on a 3D ski map with pistes and lifts.`
    : `Explore ${resort.name} on a 3D ski map with pistes and lifts.`;

  const url = `/resort/${resort.slug}`;
  const images = resort.image ? [{ url: resort.image, alt: resort.name }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "Schuss",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: resort.image ? [resort.image] : undefined,
    },
  };
}

export default async function ResortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resort = await getResortBySlug(slug);
  if (!resort) notFound();
  const conditions = await getResortConditions(resort.id);

  return (
    <main className="pb-8">
      {/* Hero */}
      <section className="relative aspect-[16/9] w-full overflow-hidden">
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
        <div className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 flex items-center gap-2">
          <ActiveResortButton slug={resort.slug} />
          <FavoriteButton slug={resort.slug} />
        </div>
        <div className="absolute inset-x-0 bottom-0 px-5 pb-12 text-white">
          <h1 className="text-3xl font-bold tracking-tight">{resort.name}</h1>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium opacity-90">
            <MapPin className="size-3.5" />
            <span>{resort.region ? `${resort.region} · ` : ""}{resort.country}</span>
          </div>
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

      {/* Live conditions */}
      {conditions ? <ConditionsCard c={conditions} /> : null}

      {/* Map */}
      <section className="px-4 mt-5">
        <ResortViewer resort={resort} />
      </section>
    </main>
  );
}

function ConditionsCard({ c }: { c: ResortConditions }) {
  const statusColor =
    c.openStatus === "open"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : c.openStatus === "partially open"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : c.openStatus === "closed"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : "bg-[color:var(--muted)] text-[color:var(--muted-foreground)]";

  const lifts =
    c.liftsOpen != null && c.liftsTotal != null
      ? `${c.liftsOpen} / ${c.liftsTotal}`
      : c.liftsOpen != null
      ? String(c.liftsOpen)
      : "—";
  const slopes =
    c.slopesOpenKm != null && c.slopesTotalKm != null
      ? `${formatKm(c.slopesOpenKm)} / ${formatKm(c.slopesTotalKm)} km`
      : "—";
  const snow =
    c.snowDepthTopCm != null || c.snowDepthBaseCm != null
      ? `${c.snowDepthTopCm ?? "—"} / ${c.snowDepthBaseCm ?? "—"} cm`
      : "—";

  return (
    <section className="px-4 mt-4">
      <div className="rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-medium text-[color:var(--muted-foreground)]">
            <LiveDot />
            Live conditions
          </div>
          {c.openStatus ? (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
              {c.openStatus}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <ConditionField label="Lifts" value={lifts} />
          <ConditionField label="Slopes" value={slopes} />
          <ConditionField label="Snow (top / base)" value={snow} />
        </div>

        <div className="mt-3 text-[11px] text-[color:var(--muted-foreground)]">
          Updated {relativeTime(c.fetchedAt)} · source: skiresort.info
        </div>
      </div>
    </section>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex size-2.5 items-center justify-center" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  );
}

function ConditionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">{label}</div>
      <div className="mt-1 font-semibold text-sm">{value}</div>
    </div>
  );
}

function formatKm(km: number): string {
  return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
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
