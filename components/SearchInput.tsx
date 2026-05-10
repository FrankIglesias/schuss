"use client";
import { useEffect, useState, useTransition } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { ResortIndexEntry } from "@/lib/types";

export function SearchInput({
  resorts,
  autoFocus = false,
  placeholder = "Search resorts, regions…",
}: {
  resorts: ResortIndexEntry[];
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [, start] = useTransition();

  const [results, setResults] = useState<ResortIndexEntry[]>([]);
  useEffect(() => {
    start(() => {
      const needle = q.trim().toLowerCase();
      if (!needle) {
        setResults([]);
        return;
      }
      const out: ResortIndexEntry[] = [];
      for (const r of resorts) {
        if (
          r.name.toLowerCase().includes(needle) ||
          r.country.toLowerCase().includes(needle) ||
          (r.region?.toLowerCase().includes(needle) ?? false)
        ) {
          out.push(r);
          if (out.length >= 8) break;
        }
      }
      setResults(out);
    });
  }, [q, resorts]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--card)] border border-[color:var(--border)] px-4 h-12 shadow-sm">
        <SearchIcon className="size-4 text-[color:var(--muted-foreground)]" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[color:var(--muted-foreground)]"
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="off"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear" className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]">
            <X className="size-4" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-2xl"
          >
            {results.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/resort/${r.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[color:var(--muted)]/60 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-[color:var(--muted-foreground)] truncate">
                      {r.region ? `${r.region} · ` : ""}{r.country}
                    </div>
                  </div>
                  {r.runKm ? (
                    <span className="shrink-0 text-xs rounded-full bg-[color:var(--muted)] px-2 py-0.5">{r.runKm} km</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
