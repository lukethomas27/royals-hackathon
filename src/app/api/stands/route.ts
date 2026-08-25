import { NextResponse } from "next/server";
import { getStands } from "@/lib/square/locations";
import { getInSeatPhysicalSection } from "@/lib/square/config";
import { getStandOrderingState, isOrderingOpen } from "@/lib/staffState";

export async function GET() {
  const stands = await getStands();
  const withState = await Promise.all(
    stands.map(async (s) => {
      const ordering = await getStandOrderingState(s.locationId);
      return { ...s, ordering, isOpen: isOrderingOpen(ordering) };
    })
  );
  return NextResponse.json({ stands: withState, inSeatPhysicalSection: getInSeatPhysicalSection() });
}
