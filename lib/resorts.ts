import Fuse from "fuse.js";
import type { ResortIndexEntry } from "./types";

export function searchResorts(
  list: ResortIndexEntry[],
  query: string,
  limit = 12,
): ResortIndexEntry[] {
  if (!query.trim()) return list.slice(0, limit);
  const fuse = new Fuse(list, {
    keys: [
      { name: "name", weight: 0.7 },
      { name: "country", weight: 0.2 },
      { name: "region", weight: 0.1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });
  return fuse.search(query, { limit }).map((r) => r.item);
}

export function resortsByCountry(
  list: ResortIndexEntry[],
): Record<string, ResortIndexEntry[]> {
  const out: Record<string, ResortIndexEntry[]> = {};
  for (const r of list) {
    (out[r.country] ??= []).push(r);
  }
  return out;
}
