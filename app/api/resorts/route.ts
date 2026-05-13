import { db } from "@/db";
import { resorts } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(resorts).limit(10);
  return Response.json(rows);
}
