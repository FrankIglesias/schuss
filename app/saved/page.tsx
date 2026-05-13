"use client";
import { useEffect, useMemo, useState } from "react";
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
      <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex flex-col items-center justify-center min-h-[60dvh] text-center">
        <Heart className="size-10 mb-3 text-[color:var(--muted-foreground)]" />
        <h1 className="text-xl font-bold">No saved resorts yet</h1>
        <p className="text-sm text-[color:var(--muted-foreground)] mt-1 max-w-xs">
          Tap the heart on any resort to save it here.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Saved</h1>
      <div className="grid grid-cols-1 gap-3">
        {list.map((r) => (
          <ResortCard key={r.slug} resort={r} size="md" />
        ))}
      </div>
    </main>
  );
}
