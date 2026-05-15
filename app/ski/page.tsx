import { getAllResorts } from "@/lib/resorts-db";
import { SkiModeView } from "@/components/SkiModeView";

export default async function SkiPage() {
  const resorts = await getAllResorts();
  return <SkiModeView resorts={resorts} />;
}
