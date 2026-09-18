// Runs a second dev server on :3001 against Square's SANDBOX using
// .env.sandbox (gitignored). Values here win over .env.local because
// Next.js never overrides variables that already exist in process.env.
// Stop the :3000 server first — both share the .next folder.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const parsed = {};
for (const line of readFileSync(".env.sandbox", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#")) parsed[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
for (const k of ["SQUARE_ACCESS_TOKEN", "NEXT_PUBLIC_SQUARE_APPLICATION_ID", "SQUARE_STAND_SLOT_1_LOCATION_ID"]) {
  if (!parsed[k]) {
    console.error(`.env.sandbox is missing ${k}. Paste the sandbox credentials, then run: npm run sandbox:seed`);
    process.exit(1);
  }
}
const env = {
  ...process.env,
  SQUARE_ENVIRONMENT: "sandbox",
  // Slots not set by the seed script must be EMPTY so .env.local's
  // production location IDs do not leak into the sandbox run.
  SQUARE_STAND_SLOT_2_LOCATION_ID: "",
  SQUARE_STAND_SLOT_3_LOCATION_ID: "",
  SQUARE_STAND_SLOT_4_LOCATION_ID: "",
  SQUARE_STAND_SLOT_1_HEATMAP_KEY: "",
  SQUARE_STAND_SLOT_4_HEATMAP_KEY: "",
  SQUARE_ORDERING_STATIONS_URL: "",
  KV_REST_API_URL: "",
  KV_REST_API_TOKEN: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  ...parsed,
};
console.log(
  `[dev:sandbox] ${env.SQUARE_ENVIRONMENT} · app ${env.NEXT_PUBLIC_SQUARE_APPLICATION_ID.slice(0, 14)}… · promo ${env.ORDER_PROMO_CODE ? "on" : "off"}`
);
const child = spawn("npx", ["next", "dev", "-p", "3001"], { stdio: "inherit", shell: true, env });
child.on("exit", (code) => process.exit(code ?? 0));
