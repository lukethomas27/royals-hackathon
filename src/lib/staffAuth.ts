import { NextRequest } from "next/server";
import { getStaffPasscode } from "@/lib/square/config";

/** Passcode gate shared by every /api/staff/* route. */
export function isStaffAuthorized(req: NextRequest): boolean {
  const configured = getStaffPasscode();
  if (!configured) return true; // dev fallback — STATUS.md flags this as unsafe for launch
  const provided = req.headers.get("x-staff-passcode");
  return provided === configured;
}
