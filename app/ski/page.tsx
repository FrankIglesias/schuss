import { getAllResorts } from "@/lib/resorts/queries";
import { SkiModeView } from "@/components/SkiModeView";

export default async function SkiPage() {
  const resorts = await getAllResorts();
  return <SkiModeView resorts={resorts} />;
}
