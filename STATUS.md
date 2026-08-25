# Build status — Aug 25, 2026

Written against `royals-app-build-context-v3.md` (the ArenaPulse project doc).
Read that first — this file only tracks what's implemented, what's stubbed,
and what still needs live Square access to finish or even verify.

## Update — Aug 25, 2026, follow-up session

This session had npm registry access and ran `npm install && npm run build
&& npm run lint` for the first time — see "Build-verified" below, this
undoes the biggest caveat in the "What this session could and couldn't do"
section right below (kept as-is since it's still accurate for what that
*build* session covered). Also fixed the staff-persistence durability gap.
The two Catalog field guesses are now docs-checked instead of blind — still
**unverified against Eventium's actual account**, since neither the CSV nor
dashboard access exists in this environment. Still no live Square
credentials either — see "Still blocked" below for exactly what that
leaves open.

**Build-verified:** `npm install` succeeds (no registry restriction in this
environment). `npm run build` compiles clean, TypeScript passes, all 8
routes generate. `npm run lint` has 1 pre-existing error + 3 warnings, all
in files untouched this session (`ThemeToggle.tsx` — setState-in-effect,
`staff/page.tsx` and `orders.ts` — unused eslint-disable directives,
`mock.ts` — unused param) — not fixed here, out of scope for this pass.
Also ran the app end-to-end against mock data via the dev server and curl:
stand list, menu browse (items correctly filtered to orderable-only),
cart/checkout math, order submission (pickup and in-seat delivery), the
24oz-alcohol-limit gate, the invalid-seat-section gate, the sold-out gate,
and the staff force-open/force-closed override actually blocking a
subsequent order — all behave correctly.

**Catalog field mapping — still unverified against Eventium's account,
upgraded from blind guess to docs-checked:** the Eventium catalog CSV
(`13-eventium/square-export/8XXMBBH0AT7HD_catalog-2026-07-28-0318.csv`)
isn't on disk in this environment, so this is **not** checked against
Eventium's actual export or dashboard — that check still hasn't happened.
What did happen: checked Square's own generic public API docs and
developer forum (applies to every Square merchant, not Eventium
specifically):
`ecom_visibility` (the "Online" mapping) is confirmed real and documented.
"Self-serve" is confirmed to have **no** per-item Catalog API field
anywhere in Square's public docs — checked the full CatalogItem field list
(`available_online`, `available_for_pickup`, `available_electronically`,
`skip_modifier_screen`, etc. — none of these mean self-serve/kiosk, they're
shipping/pickup/electronic *fulfillment* flags). Square's self-serve
ordering (Kiosk hardware, QR self-order) is a site/product-level feature,
not Catalog item data. `selfServeEnabled` defaulting `true` is therefore
the correct fallback, not an open guess — see `src/lib/square/catalog.ts`
file header for the full citation trail. Genuinely still unresolved: is
Eventium doing something bespoke here that isn't part of the public
Catalog API surface? Only dashboard access answers that.

**Staff open/close persistence — fixed.** `src/lib/staffState.ts` now uses
Vercel KV (`@vercel/kv`, added as a dependency) when `KV_REST_API_URL` /
`KV_REST_API_TOKEN` are set — durable on Vercel's serverless runtime, fixing
the exact gap this file used to flag. Falls back to the same JSON-file
behavior as before when those env vars are unset (local dev, or this
mock-data build), so nothing else changes for anyone not yet using KV.
Verified via the dev-server test above (force-close persisted and actually
blocked a subsequent order). No live KV store exists in this environment,
so only the fallback path has been exercised end-to-end — the KV path is
correct against the documented `@vercel/kv` API but unverified against a
real KV instance.

**`.env.example` — added.** Referenced by `CLAUDE.md`/this file for
sessions but was never actually committed; a session locating it would have
found nothing. Now documents every env var this app reads, including the
two new KV ones.

## Still blocked

- **The Eventium catalog CSV and any `13-eventium` project directory are
  not present anywhere on this disk** (checked broadly). If that's expected
  to exist in a different environment/mount, whoever runs the next session
  there should re-check the two Catalog field guesses against it directly
  — the docs-based confirmation above is a reasonable stand-in, not a
  substitute for the real export.
- **Payment capture (Web Payments SDK)** — untouched this session,
  deliberately, per instruction: needs real Square credentials to build
  against sensibly. Still exactly as described below.
- **Ordering Stations seat-picker API exposure** — untouched this session,
  deliberately: still genuinely blocked on Square dashboard/account access,
  not something to guess at. Still exactly as described below.
- **Real Square credentials** — still none in this environment. Everything
  above was verified against mock data only; `isSquareConfigured()` still
  returns false everywhere.

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
   an optional nice-to-have. (Update: done in the Aug 25 follow-up session
   above — build and install are clean, lint has pre-existing issues only.)

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
- **Staff open/close persistence** (`src/lib/staffState.ts`) — FIXED in the
  Aug 25 follow-up session above: now backed by Vercel KV when
  `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set, durable on Vercel's
  serverless runtime. Still falls back to the local JSON file when those
  are unset (dev / this mock-data build), which is the only path actually
  exercised so far — provision a real KV store and test that path before
  launch.
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
- **Two Square Catalog fields, previously "best-effort guesses" — checked
  against Square's *generic* public docs in the Aug 25 follow-up session
  above, still UNVERIFIED against Eventium's actual account** (the CSV and
  dashboard access still aren't available in this environment, so this is
  docs-confirmation only, not a live-account check): "Online" ->
  `ecom_visibility`, confirmed to be a real documented field in general.
  "Self-serve" -> confirmed no per-item Catalog API field exists for this
  anywhere in Square's public docs, so defaulting `selfServeEnabled` true
  is a reasoned fallback rather than an open guess — but still not checked
  against what Eventium's dashboard actually shows. See `catalog.ts` file
  header for the citation trail. Only remaining question: whether Eventium's actual
  setup does something bespoke outside the public API — needs dashboard
  access to rule out, not more research from outside it.
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
