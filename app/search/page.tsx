import { getAllResorts } from "@/lib/resorts/queries";
import { getOpenResortSlugs } from "@/lib/conditions/queries";
import { SearchPanel } from "@/components/SearchPanel";

export default async function SearchPage() {
  const [resorts, openSlugs] = await Promise.all([getAllResorts(), getOpenResortSlugs()]);
  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-center">Search</h1>
      <SearchPanel resorts={resorts} openSlugs={openSlugs} />
    </main>
  );
}
