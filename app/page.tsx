import { getAllResorts } from "@/lib/resorts/queries";
import { ResortCard } from "@/components/ResortCard";
import { SearchInput } from "@/components/SearchInput";
import { MyResortsSection } from "@/components/MyResortsSection";
import { Snowflake, Star } from "lucide-react";

export default async function HomePage() {
  const resorts = await getAllResorts();
  const featured = resorts.slice(0, 5);

  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-6">
      <header className="space-y-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <Snowflake className="size-6 text-[color:var(--accent)]" />
          <h1 className="text-2xl font-bold tracking-tight leading-none">Schuss</h1>
        </div>
        <p className="text-sm text-[color:var(--muted-foreground)] leading-relaxed">
          Discover ski resorts around the world. Browse pistes and lifts on detailed 3D
          maps, save your favorites, and find your next mountain.
        </p>
      </header>

      <SearchInput resorts={resorts} placeholder="Search resorts, regions, countries…" />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--muted-foreground)] uppercase tracking-wide flex items-center gap-2">
          <Star className="size-4 text-amber-400" fill="#fbbf24" />
          <span>Featured</span>
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {featured.map((r) => (
            <ResortCard key={r.slug} resort={r} size="md" />
          ))}
        </div>
      </section>

      <MyResortsSection />
    </main>
  );
}
