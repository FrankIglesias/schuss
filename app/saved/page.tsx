"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { ResortCard } from "@/components/ResortCard";
import { useFavorites } from "@/lib/favorites";
import type { ResortIndexEntry } from "@/lib/types";

export default function SavedPage() {
  const { favorites } = useFavorites();
  const [resorts, setResorts] = useState<ResortIndexEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/resorts")
      .then((r) => r.json())
      .then((data: ResortIndexEntry[]) => {
        if (!cancelled) setResorts(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(
    () => (resorts ?? []).filter((r) => favorites.has(r.slug)),
    [resorts, favorites],
  );

  if (resorts !== null && list.length === 0) {
    return (
      <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-24">
        <div className="rounded-3xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] px-6 py-12 text-center space-y-3">
          <div className="mx-auto grid place-items-center size-14 rounded-full bg-[color:var(--muted)]">
            <Heart className="size-7 text-[color:var(--accent)]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">No saved resorts yet</h1>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Tap the heart on any resort to save it here. Your favorites will appear in
            one place, ready for your next trip.
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
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-center">Saved</h1>
      <div className="grid grid-cols-1 gap-3">
        {list.map((r) => (
          <ResortCard key={r.slug} resort={r} size="md" />
        ))}
      </div>
    </main>
  );
}
