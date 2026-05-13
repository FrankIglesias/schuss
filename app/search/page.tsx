import { getAllResorts } from "@/lib/resorts-db";
import { SearchInput } from "@/components/SearchInput";
import { ResortsMap } from "@/components/ResortsMap";

export default async function SearchPage() {
  const resorts = await getAllResorts();
  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>
      <SearchInput resorts={resorts} autoFocus />
      <ResortsMap resorts={resorts} />
    </main>
  );
}
