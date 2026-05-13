import { getAllResorts } from "@/lib/resorts-db";
import { resortsByCountry } from "@/lib/resorts";
import { ResortCard } from "@/components/ResortCard";
import { SearchInput } from "@/components/SearchInput";
import { MyResortsSection } from "@/components/MyResortsSection";
import { countryFlag } from "@/lib/country-flags";
import { Snowflake, Star } from "lucide-react";

export default async function HomePage() {
  const resorts = await getAllResorts();
  const grouped = resortsByCountry(resorts);
  const featured = resorts.slice(0, 5);

  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-6">
      <header className="flex items-center gap-2">
        <Snowflake className="size-6 text-[color:var(--accent)]" />
        <h1 className="text-2xl font-bold tracking-tight leading-none">Schuss</h1>
      </header>

      <SearchInput resorts={resorts} placeholder="Search resorts, regions, countries…" />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--muted-foreground)] uppercase tracking-wide flex items-center gap-2">
          <Star className="size-4 text-amber-400" fill="#fbbf24" />
          <span>Featured</span>
        </h2>
        <div className="-mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {featured.map((r) => (
            <div key={r.slug} className="snap-start shrink-0 w-[78%]">
              <ResortCard resort={r} size="lg" />
            </div>
          ))}
        </div>
      </section>

      <MyResortsSection />

      {Object.entries(grouped).map(([country, list]) => (
        <section key={country} className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--muted-foreground)] uppercase tracking-wide flex items-center gap-2">
            {countryFlag(country) && (
              <span aria-hidden className="text-base leading-none">{countryFlag(country)}</span>
            )}
            <span>{country}</span>
          </h2>
          <div className="-mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar">
            {list.slice(0, 12).map((r) => (
              <div key={r.slug} className="shrink-0 w-[68%]">
                <ResortCard resort={r} size="md" />
              </div>
            ))}
          </div>
        </section>
      ))}

      <footer className="pt-2 pb-4 text-[11px] text-[color:var(--muted-foreground)] text-center">
        Map © OpenFreeMap & OSM · Terrain © Mapzen/AWS · Pistes © OpenSkiMap
      </footer>
    </main>
  );
}
