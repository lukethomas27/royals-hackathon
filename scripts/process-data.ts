import fs from "fs";
import path from "path";
import Papa from "papaparse";

interface TransactionRow {
  Date: string;
  Time: string;
  Category: string;
  Item: string;
  Qty: string;
  "Price Point Name": string;
  Location: string;
}

interface Transaction {
  time: string;
  location: string;
  qty: number;
  category: string;
  item: string;
}

interface GameData {
  date: string;
  transactions: Transaction[];
  locations: string[];
}

const EXTERNAL_DIR = path.join(__dirname, "..", "External");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data", "games");

function processAllCSVs(): Map<string, Transaction[]> {
  const allTransactions = new Map<string, Transaction[]>();

  const csvFiles = fs.readdirSync(EXTERNAL_DIR).filter((f) => f.endsWith(".csv"));

  for (const file of csvFiles) {
    const content = fs.readFileSync(path.join(EXTERNAL_DIR, file), "utf-8");
    const parsed = Papa.parse<TransactionRow>(content, {
      header: true,
      skipEmptyLines: true,
    });

    for (const row of parsed.data) {
      if (!row.Date || !row.Time || !row.Location) continue;

      const date = row.Date;
      const tx: Transaction = {
        time: row.Time,
        location: row.Location,
        qty: parseInt(row.Qty, 10) || 1,
        category: row.Category,
        item: row.Item,
      };

      if (!allTransactions.has(date)) {
        allTransactions.set(date, []);
      }
      allTransactions.get(date)!.push(tx);
    }
  }

  return allTransactions;
}

function main() {
  console.log("Processing CSV files...");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const transactionsByDate = processAllCSVs();
  const allLocations = new Set<string>();
  const gameIndex: { date: string; transactionCount: number }[] = [];

  for (const [date, transactions] of transactionsByDate) {
    transactions.sort((a, b) => a.time.localeCompare(b.time));
    const locations = [...new Set(transactions.map((t) => t.location))].sort();
    locations.forEach((l) => allLocations.add(l));

    const gameData: GameData = { date, transactions, locations };
    fs.writeFileSync(path.join(OUTPUT_DIR, `${date}.json`), JSON.stringify(gameData));

    gameIndex.push({ date, transactionCount: transactions.length });
    console.log(`  ${date}: ${transactions.length} transactions`);
  }

  gameIndex.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "index.json"),
    JSON.stringify({ games: gameIndex, locations: [...allLocations].sort() })
  );

  console.log(`\nDone! Processed ${gameIndex.length} game dates into ${OUTPUT_DIR}`);
}

main();
