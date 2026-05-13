import { getAllResorts } from "@/lib/resorts-db";

export const revalidate = 3600;

export async function GET() {
  const rows = await getAllResorts();
  return Response.json(rows);
}
