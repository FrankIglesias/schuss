import Fuse from "fuse.js";
import resortsData from "@/resorts.json";
import type { ResortIndexEntry } from "./types";

export const resorts: ResortIndexEntry[] = resortsData as ResortIndexEntry[];

export function getResort(slug: string): ResortIndexEntry | undefined {
  return resorts.find((r) => r.slug === slug);
}

let fuse: Fuse<ResortIndexEntry> | null = null;
export function searchResorts(query: string, limit = 12): ResortIndexEntry[] {
  if (!query.trim()) return resorts.slice(0, limit);
  if (!fuse) {
    fuse = new Fuse(resorts, {
      keys: [
        { name: "name", weight: 0.7 },
        { name: "country", weight: 0.2 },
        { name: "region", weight: 0.1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
    });
  }
  return fuse.search(query, { limit }).map((r) => r.item);
}

export function resortsByCountry(): Record<string, ResortIndexEntry[]> {
  const out: Record<string, ResortIndexEntry[]> = {};
  for (const r of resorts) {
    (out[r.country] ??= []).push(r);
  }
  return out;
}
