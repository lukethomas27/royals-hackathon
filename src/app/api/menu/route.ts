import { NextRequest, NextResponse } from "next/server";
import { getMenu, orderableItems } from "@/lib/square/catalog";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  const { items, taxesById, source } = await getMenu(locationId);
  return NextResponse.json({
    items: orderableItems(items),
    taxesById,
    source, // "live" | "mock" — surfaced so the UI can badge demo data honestly
  });
}
