import { NextResponse } from "next/server";
import { getStands } from "@/lib/square/locations";
import { getInSeatPhysicalSection } from "@/lib/square/config";
import { isSquareConfigured } from "@/lib/square/client";
import { getStandOrderingState, isOrderingOpen } from "@/lib/staffState";

export async function GET() {
  const stands = await getStands();
  const withState = await Promise.all(
    stands.map(async (s) => {
      const ordering = await getStandOrderingState(s.locationId);
      return { ...s, ordering, isOpen: isOrderingOpen(ordering) };
    })
  );
  return NextResponse.json({
    stands: withState,
    inSeatPhysicalSection: getInSeatPhysicalSection(),
    // What the browser needs to load Square's Web Payments SDK. The app ID
    // is a public client-side value; the access token never leaves the server.
    square: {
      configured: isSquareConfigured(),
      applicationId: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? null,
      environment: process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox",
    },
  });
}
