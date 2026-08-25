# Build status — Aug 25, 2026

Written against `royals-app-build-context-v3.md` (the ArenaPulse project doc).
Read that first — this file only tracks what's implemented, what's stubbed,
and what still needs live Square access to finish or even verify.

## What this session could and couldn't do

This build ran in a sandboxed session with **no live Square credentials**
and **no network access to the npm registry**, so two things are true of
everything below:

1. **Nothing here has been tested against Eventium's actual Square
   account.** It's written against Square's publicly documented API shapes,
   with every place that's a best guess (rather than confirmed) flagged
   inline in the code and listed again below.
2. **`npm install` / `npm run build` could not be run in this session** —
   the sandbox's network egress doesn't reach `registry.npmjs.org`. The code
   was syntax-checked with TypeScript's transpiler (catches malformed
   syntax) but not type-checked or build-verified end to end. **Before this
   ships or gets reviewed, someone needs to run `npm install && npm run
   build && npm run lint` locally or in CI** — treat that as step zero, not
   an optional nice-to-have.

## What's real and wired end to end

- **Menu is a live read, not a static import** (section 4). `src/lib/square/catalog.ts`
  hits `/v2/catalog/search` and maps items/variations/categories/taxes. No
  hardcoded menu, no seeded prices anywhere in the app.
- **Four stands, keyed by Square location ID, never by name** (section 2).
  `src/lib/square/config.ts` + `locations.ts`. Display names render live
  from Square's location/catalog response every time — see `Stand.displayName`.
  Phillips Bar and Portable Stations are gone from the app entirely.
- **Alcohol gated on Liquor Tax, not `Contains Alcohol`** (section 8).
  `src/lib/square/tax.ts` — `isAlcoholicItem()` checks the item's assigned
  tax objects for one named "Liquor Tax", never the unreliable flag.
- **2-drinks-per-order / 1-if-24oz enforced both client- and server-side**
  (section 6a). Client for UX, server (`/api/orders`) as the actual gate —
  never trust the browser.
- **No ops dashboard, no order queue, no KDS, no staff app** (section 6) —
  none of that was built. The one exception scope explicitly reopened
  (section 6a) — staff open/close control — is at `/staff`.
- **Phone + SMS only, no accounts** (section 6/9). `OrderPanel.tsx` never
  asks for anything but a phone number and an SMS opt-in checkbox.
- **Orders created against the correct location ID** (section 5, build-team
  rule 5) — `/api/orders` resolves the stand from `locationId` and creates
  the Square order there, never against a default/wrong location.
- **Seat picker constrained to sections 107–111 with no hardcoded seat
  map** (section 6). See "Open questions" below for the one piece that's
  genuinely unresolved rather than just unbuilt.

## What's stubbed or incomplete, and why

- **Payment capture.** `/api/orders` creates a Square Order but does not
  charge a card — there's no Web Payments SDK integration. That needs a
  live Square Application ID and a sandbox to test against, which this
  session doesn't have. The checkout UI says this plainly rather than
  pretending otherwise.
- **Staff open/close persistence** (`src/lib/staffState.ts`) is a JSON file
  on local disk. That's fine for `npm run dev`, **not fine for Vercel**
  (serverless filesystem writes don't persist across invocations). Before
  launch this needs a real small store — Vercel KV or Upstash Redis is the
  obvious fit for something this size. The file is written so swapping the
  two functions in `staffState.ts` is the only change needed.
- **`STAFF_PASSCODE` unset = `/staff` is open to anyone with the URL.** Dev
  convenience only, called out in the route and in `.env.example`. Set it
  before this is reachable from a real domain.
- **Ordering Stations (the seat/row source) has no confirmed API.** Build
  doc section 6 explicitly says this is the one thing that could still turn
  into manual data entry, and to check it early. I don't have Square
  dashboard access to check it. `src/lib/square/stations.ts` is written so
  that whoever *does* have access can drop the real fetch into
  `fetchLiveOrderingStations()` and nothing else in the app changes — until
  then, the app asks for section/row/seat as plain fields, validated only
  against the safety-net section list (107–111), never a hand-typed seat
  database. **This is the build doc's own first-task item, unchanged: go
  confirm this before assuming either path.**
- **Two Square Catalog fields are best-effort guesses**, flagged at the top
  of `catalog.ts`: the field backing the dashboard's "Online" column
  (mapped to `ecom_visibility`) and "Self-serve" (not mapped to anything —
  defaulted true everywhere, because self-serve is very likely a Square
  Online *site* setting rather than base Catalog data, and there's no
  public API surface for it that I could find). Both need five minutes of
  checking against a live account rather than more guessing from outside it.
- **Inventory counts are read as `null`** — sold-out state comes from
  `location_overrides[].sold_out` on each variation, which is a real
  documented field, but exact remaining-count tracking (`/v2/inventory/*`)
  isn't wired up. Section 6a's "test that sold-out actually propagates" is
  still an open task either way — this doesn't replace that check.
- **Theme/palette:** left as-is (still `--accent-gold`), per the build doc's
  own instruction to hold the rebuild until Dustin confirms the corrected
  navy/grey/black/white palette (section 9). Colors were pulled out of
  scattered hex literals into the existing CSS custom properties so the
  eventual rebuild is a CSS-variable swap, not a component hunt — nothing
  was restyled.

## Open questions this session could not resolve (need live account access)

These are the build doc's own "first three tasks once the deposit lands"
(section 12) — restated here because they block *verifying* this build
works, not because I skipped them:

1. **Does webhook creation work at Administrator level?** Unverified.
   `client.ts` doesn't touch webhooks at all yet — there's no webhook
   receiver in this codebase. If the live-read architecture ends up needing
   push updates rather than polling, that's new work, not a config change.
2. **Are Ordering Stations exposed via API, or dashboard-only?** Unverified
   — see above. Decides whether `stations.ts` gets a real implementation or
   the seat picker permanently stays a constrained free-text fallback.
3. **Does sold-out state actually propagate to whatever surface this app
   reads?** Unverified. `location_overrides[].sold_out` is the documented
   field this app reads; whether Square's dashboard "Sold Out" toggle and
   inventory-hits-zero both actually set it needs a live test, per section 6a.

## Correction surfaced to Lautaro separately

Worth repeating here since it changes the estimate: the project brief this
session started from framed the seat/row database as an open question,
assuming it needed to be built from scratch. The v3 doc itself already
resolves that the opposite way (section 6): Matt confirmed the seat/row
data for sections 107–111 already exists in Square as Ordering Stations,
and the v2 "build it ourselves" assumption was explicitly withdrawn. This
build follows the v3 doc, not the framing — no hand-built seat database
exists anywhere in this codebase.

## Repo/delivery note

This session has no push access to `lukethomas27/royals-hackathon` — it's
not this account's repo. Changes are sitting in a local clone pending
however Aashna/Luke want them delivered (patch, zip, PR from a fork, or
direct push once access is granted).
