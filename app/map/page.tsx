import { getAllResorts } from "@/lib/resorts-db";
import { ResortsMap } from "@/components/ResortsMap";

export default async function MapPage() {
  const resorts = await getAllResorts();
  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-center">Map</h1>
      <ResortsMap resorts={resorts} />
    </main>
  );
}
