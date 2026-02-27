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
