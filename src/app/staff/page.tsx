"use client";

// Staff control surface — build doc section 6a: "not a dashboard, not a
// queue, but not nothing either." One job: let a staff member standing in
// the concourse find the ordering off switch fast, plus set a per-game
// scheduled cutoff as a fallback safety net. The manual switch is the real
// control; the schedule exists because "the start of the 3rd period isn't a
// set time" so nothing purely scheduled is ever exactly right.

import { useEffect, useState } from "react";

interface StaffStand {
  locationId: string;
  displayName: string;
  role: "pickup" | "in_seat";
  isOpen: boolean;
  ordering: { manualOverride: "open" | "closed" | null; scheduledCutoff: string | null };
}

export default function StaffPage() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stands, setStands] = useState<StaffStand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(pc: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/status", { headers: { "x-staff-passcode": pc } });
      if (!res.ok) {
        setError("Wrong passcode.");
        setAuthed(false);
        return;
      }
      const data = await res.json();
      setStands(data.stands);
      setAuthed(true);
    } finally {
      setLoading(false);
    }
  }

  async function setOverride(locationId: string, manualOverride: "open" | "closed" | null) {
    const res = await fetch("/api/staff/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-staff-passcode": passcode },
      body: JSON.stringify({ locationId, manualOverride }),
    });
    if (res.ok) load(passcode);
  }

  async function setCutoff(locationId: string, scheduledCutoff: string) {
    const res = await fetch("/api/staff/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-staff-passcode": passcode },
      body: JSON.stringify({ locationId, scheduledCutoff: scheduledCutoff || null }),
    });
    if (res.ok) load(passcode);
  }

  useEffect(() => {
    // If no passcode is configured server-side, GET succeeds with any value —
    // this still tries an initial load so the page isn't stuck on a login
    // screen in dev. See STATUS.md: an unset STAFF_PASSCODE is a dev
    // convenience only and must be set before launch.
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6" style={{ backgroundColor: "var(--bg-body)" }}>
        <div className="w-full max-w-xs">
          <h1 className="text-xl font-bold mb-4 text-center" style={{ color: "var(--text-primary)" }}>Staff ordering control</h1>
          <input
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(passcode); }}
            className="w-full rounded-lg px-4 py-3 text-base border mb-3"
            style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
            autoFocus
          />
          <button
            onClick={() => load(passcode)}
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold"
            style={{ backgroundColor: "var(--accent-gold)", color: "var(--text-inverted)" }}
          >
            {loading ? "Checking…" : "Enter"}
          </button>
          {error && <p className="text-sm mt-3 text-center" style={{ color: "#ef4444" }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6" style={{ backgroundColor: "var(--bg-body)" }}>
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Staff ordering control</h1>
        <p className="text-xs mb-6" style={{ color: "var(--text-tertiary)" }}>
          Stands are CLOSED until you open them. Manual switch always wins; the scheduled cutoff is the fallback if nobody flips it back.
        </p>

        <div className="space-y-4">
          {stands.map((s) => (
            <div key={s.locationId} className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{s.displayName}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.role === "in_seat" ? "In-seat delivery" : "Pickup"}</div>
                </div>
                <span
                  className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: s.isOpen ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color: s.isOpen ? "#16a34a" : "#ef4444",
                  }}
                >
                  {s.isOpen ? "OPEN" : "CLOSED"}
                </span>
              </div>

              {/* Big, obvious ON/OFF — this is the control staff actually use */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => setOverride(s.locationId, "open")}
                  className="py-4 rounded-lg text-base font-bold"
                  style={{
                    backgroundColor: s.ordering.manualOverride === "open" ? "#16a34a" : "var(--btn-bg)",
                    color: s.ordering.manualOverride === "open" ? "#fff" : "var(--btn-text)",
                  }}
                >
                  FORCE OPEN
                </button>
                <button
                  onClick={() => setOverride(s.locationId, "closed")}
                  className="py-4 rounded-lg text-base font-bold"
                  style={{
                    backgroundColor: s.ordering.manualOverride === "closed" ? "#dc2626" : "var(--btn-bg)",
                    color: s.ordering.manualOverride === "closed" ? "#fff" : "var(--btn-text)",
                  }}
                >
                  FORCE CLOSED
                </button>
              </div>
              {s.ordering.manualOverride !== null && (
                <button
                  onClick={() => setOverride(s.locationId, null)}
                  className="w-full py-2 rounded-lg text-xs font-semibold mb-3"
                  style={{ backgroundColor: "var(--btn-bg)", color: "var(--text-tertiary)" }}
                >
                  Clear override, follow schedule
                </button>
              )}

              <label className="block text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
                Scheduled cutoff (fallback — start of 3rd period isn&apos;t a fixed time, set your best estimate)
              </label>
              <input
                type="datetime-local"
                defaultValue={s.ordering.scheduledCutoff?.slice(0, 16) ?? ""}
                onBlur={(e) => setCutoff(s.locationId, e.target.value ? new Date(e.target.value).toISOString() : "")}
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
            </div>
          ))}
          {stands.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              No stands configured yet — set SQUARE_STAND_SLOT_*_LOCATION_ID.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
