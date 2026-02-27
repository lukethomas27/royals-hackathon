"use client";

import { BestTimeResult } from "@/lib/demandTimeline";

interface BestTimeCardProps {
  result: BestTimeResult;
  context: string; // e.g. "Food", "Island Slice", or "all stands"
}

export default function BestTimeCard({ result, context }: BestTimeCardProps) {
  if (result.bestTimes.length === 0) return null;

  return (
    <div
      className="w-full rounded-xl px-4 py-3 mt-2 mb-2"
      style={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: "#c5a94e" }}>
        Best time for {context}?
      </p>

      <div className="space-y-1.5">
        {result.bestTimes.map((bt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="text-sm font-mono font-bold"
              style={{ color: i === 0 ? "#22c55e" : "#4ade80", minWidth: "72px" }}
            >
              {bt.time}
            </span>
            <span className="text-xs text-slate-400">{bt.label}</span>
            {i === 0 && (
              <span
                className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "#22c55e20", color: "#22c55e" }}
              >
                GO
              </span>
            )}
          </div>
        ))}
      </div>

      {result.worstTime && (
        <div
          className="flex items-center gap-2 mt-2 pt-2"
          style={{ borderTop: "1px solid #334155" }}
        >
          <span className="text-sm font-mono" style={{ color: "#ef4444", minWidth: "72px" }}>
            {result.worstTime.time}
          </span>
          <span className="text-xs text-slate-500">{result.worstTime.label} — avoid</span>
        </div>
      )}
    </div>
  );
}
