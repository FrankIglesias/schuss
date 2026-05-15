import Link from "next/link";
import Image from "next/image";
import { MapPin, Mountain, ArrowUp } from "lucide-react";
import type { ResortIndexEntry } from "@/lib/types";
import { FavoriteButton } from "./FavoriteButton";
import { ResortPlaceholder } from "./ResortPlaceholder";

export function ResortCard({ resort, size = "md" }: { resort: ResortIndexEntry; size?: "sm" | "md" | "lg" }) {
  const h = size === "lg" ? "h-72" : size === "sm" ? "h-40" : "h-56";
  return (
    <Link
      href={`/resort/${resort.slug}`}
      className={`group relative block ${h} w-full overflow-hidden rounded-3xl shadow-[0_12px_30px_-12px_rgba(2,6,23,0.45)] active:scale-[0.99] transition-transform`}
    >
      {resort.image ? (
        <Image
          src={resort.image}
          alt={resort.name}
          fill
          sizes="(max-width: 540px) 90vw, 480px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          unoptimized
        />
      ) : (
        <ResortPlaceholder seed={resort.slug} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <FavoriteButton slug={resort.slug} size="sm" className="absolute right-3 top-3 z-10" />
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 text-white">
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-90">
          <MapPin className="size-3.5" />
          <span>{resort.region ? `${resort.region} · ` : ""}{resort.country}</span>
        </div>
        <h3 className="mt-1 text-lg sm:text-2xl font-semibold tracking-tight line-clamp-2">
          {resort.name}
        </h3>
        <div className="mt-2 flex items-center gap-2 text-[11px] sm:text-xs">
          {resort.elevationMax ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/15 backdrop-blur px-2 py-1">
              <Mountain className="size-3.5" /> {resort.elevationMax} m
            </span>
          ) : null}
          {resort.runCount ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/15 backdrop-blur px-2 py-1">
              <ArrowUp className="size-3.5" /> {resort.runCount} p.
            </span>
          ) : resort.runKm ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/15 backdrop-blur px-2 py-1">
              <ArrowUp className="size-3.5" /> {resort.runKm} km
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
