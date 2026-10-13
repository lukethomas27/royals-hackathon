import { NextRequest, NextResponse } from "next/server";
import { getStands } from "@/lib/square/locations";
import { getStandOrderingState, setStandOrderingState, isOrderingOpen } from "@/lib/staffState";
import { isStaffAuthorized } from "@/lib/staffAuth";
import { defaultStaffFor, isValidStaffCount, MAX_STAFF, MIN_STAFF } from "@/lib/square/staffing";

export async function GET(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stands = await getStands();
  const data = await Promise.all(
    stands.map(async (s) => {
      const state = await getStandOrderingState(s.locationId);
      return { ...s, ordering: state, isOpen: isOrderingOpen(state), defaultStaff: defaultStaffFor(s.locationId) };
    })
  );
  return NextResponse.json({ stands: data });
}

export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { locationId, manualOverride, scheduledCutoff, staffCount } = body as {
    locationId: string;
    manualOverride?: "open" | "closed" | null;
    scheduledCutoff?: string | null;
    staffCount?: number | null;
  };
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  if (staffCount !== undefined && staffCount !== null && !isValidStaffCount(staffCount)) {
    return NextResponse.json(
      { error: `People working must be a whole number from ${MIN_STAFF} to ${MAX_STAFF}.` },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (manualOverride !== undefined) patch.manualOverride = manualOverride;
  if (scheduledCutoff !== undefined) patch.scheduledCutoff = scheduledCutoff;
  if (staffCount !== undefined) patch.staffCount = staffCount;

  const next = await setStandOrderingState(locationId, patch);
  return NextResponse.json({ ordering: next, isOpen: isOrderingOpen(next) });
}
