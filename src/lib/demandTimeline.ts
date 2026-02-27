import { Transaction } from "./types";

export interface BestTimeRec {
  time: string;        // e.g. "6:45 PM"
  label: string;       // e.g. "Quietest lines"
  intensity: number;   // 0-1 how busy (lower = better)
}

export interface WorstTimeRec {
  time: string;
  label: string;
}

export interface BestTimeResult {
  bestTimes: BestTimeRec[];
  worstTime: WorstTimeRec | null;
}

/** Convert "HH:MM:SS" to total minutes from midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Format minutes-from-midnight to "H:MM PM" display string. */
function minutesToDisplay(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h = h24 > 12 ? h24 - 12 : h24 === 0 ? 12 : h24;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Analyze transactions and find the best (quietest) and worst (busiest) times.
 * Optionally filter by data categories and/or a specific location.
 */
export function findBestTimes(
  transactions: Transaction[],
  options?: {
    categories?: Set<string> | null;  // null or undefined = all
    location?: string | null;         // null or undefined = all locations
  }
): BestTimeResult {
  if (transactions.length === 0) return { bestTimes: [], worstTime: null };

  const bucketMinutes = 5;
  const cats = options?.categories ?? null;
  const loc = options?.location ?? null;

  // Filter transactions
  const filtered = transactions.filter((tx) => {
    if (tx.qty <= 0) return false;
    if (cats && !cats.has(tx.category)) return false;
    if (loc && tx.location !== loc) return false;
    return true;
  });

  if (filtered.length === 0) return { bestTimes: [], worstTime: null };

  // Bucket boundaries from full game timespan
  const startMins = timeToMinutes(transactions[0].time);
  const endMins = timeToMinutes(transactions[transactions.length - 1].time);
  const bucketStart = Math.floor(startMins / bucketMinutes) * bucketMinutes;
  const bucketEnd = Math.ceil((endMins + 1) / bucketMinutes) * bucketMinutes;
  const bucketCount = Math.floor((bucketEnd - bucketStart) / bucketMinutes);

  const counts = new Array<number>(bucketCount).fill(0);

  for (const tx of filtered) {
    const mins = timeToMinutes(tx.time);
    const idx = Math.floor((mins - bucketStart) / bucketMinutes);
    if (idx >= 0 && idx < bucketCount) {
      counts[idx] += tx.qty;
    }
  }

  // Find max for normalization
  const maxCount = Math.max(...counts, 1);

  // Build indexed buckets
  const buckets = counts.map((count, i) => ({
    index: i,
    startMins: bucketStart + i * bucketMinutes,
    count,
    intensity: count / maxCount,
  }));

  // Sort by count ascending to find quietest
  const sorted = [...buckets].sort((a, b) => a.count - b.count);

  // Pick the top 3 quietest windows (that actually have some game activity around them)
  const bestTimes: BestTimeRec[] = [];
  const usedMins = new Set<number>();

  for (const b of sorted) {
    if (bestTimes.length >= 3) break;
    // Skip if too close to an already-picked time (within 10 min)
    const tooClose = [...usedMins].some((m) => Math.abs(m - b.startMins) < 10);
    if (tooClose) continue;

    usedMins.add(b.startMins);
    const rank = bestTimes.length;
    bestTimes.push({
      time: minutesToDisplay(b.startMins),
      label: rank === 0 ? "Shortest lines" : rank === 1 ? "Also quiet" : "Low traffic",
      intensity: b.intensity,
    });
  }

  // Find the single busiest window
  const worst = buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0]);
  const worstTime: WorstTimeRec = {
    time: minutesToDisplay(worst.startMins),
    label: "Longest lines",
  };

  return { bestTimes, worstTime };
}
