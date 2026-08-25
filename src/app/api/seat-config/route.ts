import { NextResponse } from "next/server";
import { getSeatPickerConfig } from "@/lib/square/stations";

export async function GET() {
  const config = await getSeatPickerConfig();
  return NextResponse.json(config);
}
