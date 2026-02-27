import { Transaction, HeatState, LocationStats, SimulationStats } from "./types";

export interface SimulationConfig {
  speedMultiplier: number; // e.g. 30 for 30x speed
  decayIntervalMinutes: number; // e.g. 5
  decayFactor: number; // e.g. 0.5 (50% decay)
}

export const DEFAULT_CONFIG: SimulationConfig = {
  speedMultiplier: 30,
  decayIntervalMinutes: 5,
  decayFactor: 0.5,
};

export class SimulationEngine {
  private transactions: Transaction[];
  private locations: string[];
  private config: SimulationConfig;
  private rawHeat: { [location: string]: number };
  private txIndex: number;
  private simStartTime: number;
  private gameStartSeconds: number;
  private gameEndSeconds: number;
  private lastDecaySimTime: number;
  private onUpdate: (heat: HeatState, simTime: string, progress: number, stats: SimulationStats) => void;
  private animFrameId: number | null;
  private running: boolean;
  private locationStats: { [location: string]: LocationStats };
  private peakHeat: number;
  private peakStand: string;
  private peakTime: string;

  constructor(
    transactions: Transaction[],
    locations: string[],
    config: SimulationConfig,
    onUpdate: (heat: HeatState, simTime: string, progress: number, stats: SimulationStats) => void
  ) {
    this.transactions = transactions;
    this.locations = locations;
    this.config = config;
    this.onUpdate = onUpdate;
    this.rawHeat = {};
    this.txIndex = 0;
    this.simStartTime = 0;
    this.gameStartSeconds = 0;
    this.gameEndSeconds = 0;
    this.lastDecaySimTime = 0;
    this.animFrameId = null;
    this.running = false;

    for (const loc of locations) {
      this.rawHeat[loc] = 0;
    }

    this.locationStats = {};
    this.peakHeat = 0;
    this.peakStand = "";
    this.peakTime = "";
    for (const loc of locations) {
      this.locationStats[loc] = { transactionCount: 0, totalQty: 0 };
    }
  }

  private timeToSeconds(time: string): number {
    const [h, m, s] = time.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  }

  private secondsToTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const hh = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hh}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")} ${ampm}`;
  }

  private getStats(isComplete: boolean): SimulationStats {
    const AVG_PRICE = 8;
    let totalTx = 0;
    let totalQty = 0;
    let minHeat = Infinity;
    let maxHeat = -Infinity;
    let quietest = this.locations[0];
    let busiest = this.locations[0];

    for (const loc of this.locations) {
      totalTx += this.locationStats[loc].transactionCount;
      totalQty += this.locationStats[loc].totalQty;
      const h = this.rawHeat[loc];
      if (h < minHeat) { minHeat = h; quietest = loc; }
      if (h > maxHeat) { maxHeat = h; busiest = loc; }
    }

    return {
      perLocation: { ...this.locationStats },
      totalTransactions: totalTx,
      quietestStand: quietest,
      busiestStand: busiest,
      peakStand: this.peakStand,
      peakTime: this.peakTime,
      estimatedRevenue: totalQty * AVG_PRICE,
      isComplete,
    };
  }

  private getNormalizedHeat(): HeatState {
    const maxHeat = Math.max(...Object.values(this.rawHeat), 1);
    const normalized: HeatState = {};
    for (const loc of this.locations) {
      normalized[loc] = this.rawHeat[loc] / maxHeat;
    }
    return normalized;
  }

  start() {
    if (this.transactions.length === 0) return;

    this.gameStartSeconds = this.timeToSeconds(this.transactions[0].time);
    this.gameEndSeconds = this.timeToSeconds(this.transactions[this.transactions.length - 1].time);
    this.simStartTime = Date.now();
    this.txIndex = 0;
    this.lastDecaySimTime = this.gameStartSeconds;
    this.running = true;

    for (const loc of this.locations) {
      this.rawHeat[loc] = 0;
    }

    for (const loc of this.locations) {
      this.locationStats[loc] = { transactionCount: 0, totalQty: 0 };
    }
    this.peakHeat = 0;
    this.peakStand = "";
    this.peakTime = "";

    this.tick();
  }

  stop() {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick() {
    if (!this.running) return;

    const realElapsed = (Date.now() - this.simStartTime) / 1000;
    const simElapsed = realElapsed * this.config.speedMultiplier;
    const currentSimSeconds = this.gameStartSeconds + simElapsed;

    if (currentSimSeconds > this.gameEndSeconds + 60) {
      this.running = false;
      this.onUpdate(this.getNormalizedHeat(), this.secondsToTime(this.gameEndSeconds), 1, this.getStats(true));
      return;
    }

    while (
      this.txIndex < this.transactions.length &&
      this.timeToSeconds(this.transactions[this.txIndex].time) <= currentSimSeconds
    ) {
      const tx = this.transactions[this.txIndex];
      this.rawHeat[tx.location] = (this.rawHeat[tx.location] || 0) + tx.qty;
      this.locationStats[tx.location].transactionCount += 1;
      this.locationStats[tx.location].totalQty += tx.qty;
      this.txIndex++;
    }

    const decayIntervalSeconds = this.config.decayIntervalMinutes * 60;
    while (this.lastDecaySimTime + decayIntervalSeconds <= currentSimSeconds) {
      this.lastDecaySimTime += decayIntervalSeconds;
      for (const loc of this.locations) {
        this.rawHeat[loc] *= 1 - this.config.decayFactor;
      }
    }

    for (const loc of this.locations) {
      if (this.rawHeat[loc] > this.peakHeat) {
        this.peakHeat = this.rawHeat[loc];
        this.peakStand = loc;
        this.peakTime = this.secondsToTime(Math.min(currentSimSeconds, this.gameEndSeconds));
      }
    }

    const totalDuration = this.gameEndSeconds - this.gameStartSeconds;
    const progress = Math.min(simElapsed / totalDuration, 1);

    this.onUpdate(
      this.getNormalizedHeat(),
      this.secondsToTime(Math.min(currentSimSeconds, this.gameEndSeconds)),
      progress,
      this.getStats(false)
    );

    this.animFrameId = requestAnimationFrame(() => this.tick());
  }
}
