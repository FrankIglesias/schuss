"use client";
import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { ResortCard } from "@/components/ResortCard";
import { useFavorites } from "@/lib/favorites";
import type { ResortIndexEntry } from "@/lib/types";

export function MyResortsSection() {
  const { favorites } = useFavorites();
  const [resorts, setResorts] = useState<ResortIndexEntry[]>([]);

  useEffect(() => {
    if (favorites.size === 0) return;
    let cancelled = false;
    fetch("/api/resorts")
      .then((r) => r.json())
      .then((data: ResortIndexEntry[]) => {
        if (!cancelled) setResorts(data);
      });
    return () => {
      cancelled = true;
    };
  }, [favorites.size]);

  const list = useMemo(
    () => resorts.filter((r) => favorites.has(r.slug)),
    [resorts, favorites],
  );
  if (list.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[color:var(--muted-foreground)] uppercase tracking-wide flex items-center gap-2">
        <Heart className="size-4 text-rose-500" fill="#ef4444" />
        <span>My resorts</span>
      </h2>
      <div className="-mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {list.map((r) => (
          <div key={r.slug} className="snap-start shrink-0 w-[78%]">
            <ResortCard resort={r} size="lg" />
          </div>
        ))}
      </div>
    </section>
  );
}
