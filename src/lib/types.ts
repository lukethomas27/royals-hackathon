export interface Transaction {
  time: string;
  location: string;
  qty: number;
  category: string;
  item: string;
}

export interface GameData {
  date: string;
  transactions: Transaction[];
  locations: string[];
}

export interface GameIndex {
  games: { date: string; transactionCount: number }[];
  locations: string[];
}

export interface HeatState {
  [location: string]: number; // current heat value 0-1 (normalized)
}

export interface LocationStats {
  transactionCount: number;
  totalQty: number;
}

export interface SimulationStats {
  perLocation: { [location: string]: LocationStats };
  totalTransactions: number;
  quietestStand: string;
  busiestStand: string;
  peakStand: string;        // stand with highest all-time raw heat
  peakTime: string;         // sim time when peak occurred
  estimatedRevenue: number; // totalQty * AVG_PRICE
  isComplete: boolean;
}
