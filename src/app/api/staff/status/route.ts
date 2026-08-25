import { NextRequest, NextResponse } from "next/server";
import { getStands } from "@/lib/square/locations";
import { getStaffPasscode } from "@/lib/square/config";
import { getStandOrderingState, setStandOrderingState, isOrderingOpen } from "@/lib/staffState";

function checkAuth(req: NextRequest): boolean {
  const configured = getStaffPasscode();
  if (!configured) return true; // dev fallback — STATUS.md flags this as unsafe for launch
  const provided = req.headers.get("x-staff-passcode");
  return provided === configured;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stands = await getStands();
  const data = await Promise.all(
    stands.map(async (s) => {
      const state = await getStandOrderingState(s.locationId);
      return { ...s, ordering: state, isOpen: isOrderingOpen(state) };
    })
  );
  return NextResponse.json({ stands: data });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { locationId, manualOverride, scheduledCutoff } = body as {
    locationId: string;
    manualOverride?: "open" | "closed" | null;
    scheduledCutoff?: string | null;
  };
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (manualOverride !== undefined) patch.manualOverride = manualOverride;
  if (scheduledCutoff !== undefined) patch.scheduledCutoff = scheduledCutoff;

  const next = await setStandOrderingState(locationId, patch);
  return NextResponse.json({ ordering: next, isOpen: isOrderingOpen(next) });
}
