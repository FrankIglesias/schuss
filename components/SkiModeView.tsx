"use client";
import Link from "next/link";
import { Snowflake, Info } from "lucide-react";
import { ResortMap } from "@/components/ResortMap";
import { useActiveResort } from "@/lib/active-resort";
import type { ResortIndexEntry } from "@/lib/types";

export function SkiModeView({ resorts }: { resorts: ResortIndexEntry[] }) {
  const { activeSlug } = useActiveResort();
  const resort = activeSlug ? resorts.find((r) => r.slug === activeSlug) : null;

  if (!resort) {
    return (
      <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-24">
        <div className="rounded-3xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] px-6 py-12 text-center space-y-3">
          <div className="mx-auto grid place-items-center size-14 rounded-full bg-[color:var(--muted)]">
            <Snowflake className="size-7 text-[color:var(--accent)]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">No ski resort selected</h1>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Open any resort and tap “Set ski mode” to pin it here. The map will be ready
            when you reach the slopes.
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent)] text-white h-11 px-5 text-sm font-semibold"
          >
            Browse resorts
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex flex-col gap-3"
      style={{ height: "calc(100dvh - 6rem - env(safe-area-inset-bottom))" }}
    >
      <div className="relative text-center">
        <h1 className="text-base font-semibold tracking-tight truncate">{resort.name}</h1>
        <Link
          href={`/resort/${resort.slug}`}
          aria-label="Resort details"
          title="Details"
          className="absolute right-0 top-1/2 -translate-y-1/2 grid place-items-center size-9 rounded-full text-[color:var(--accent)] hover:bg-[color:var(--muted)]/40 active:scale-95 transition"
        >
          <Info className="size-5" />
        </Link>
      </div>
      <div className="flex-1 min-h-0">
        <ResortMap resort={resort} fill />
      </div>
    </main>
  );
}
