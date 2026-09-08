# Build status — Sep 7, 2026

Written against `royals-app-build-context-v3.md` (the ArenaPulse project doc).
This file tracks what's implemented, what's stubbed, and what still needs
live Square access to finish or verify. Newest session first.

## Update — Sep 7, 2026: live Square account inspected (read-only)

Luke now has admin rights on the Eventium Square account. This session
read the Square Developer console, the seller dashboard and the Square
Online site config through Luke's logged-in browser. **Nothing was changed
in Square.** No access token was copied — that's for Luke to paste into
`.env.local` himself (Developer console → Credentials → Production Access
token → Show). Until then the app still runs on mock data.

**Resolved — the 4 launch stands and their Square location IDs.** The
seller-dashboard login is scoped to exactly these four, and they are the
only SOFMC food stands with QR ordering enabled, so no guesswork:

| Slot | Square location (live display name today) | Location ID | Role |
|---|---|---|---|
| 1 | SOFMC Concession 1 | `06KYFX4ZMH3XB` | pickup |
| 2 | SOFMC Concession 2 | `LARSXNSYK7Z6G` | pickup |
| 3 | SOFMC Concession 3 | `L21YPQA79XH0J` | pickup |
| 4 | SOFMC ReMax Fan Deck | `LZQZQS9G9XF1M` | in-seat delivery |

Already written to the (gitignored) `.env.local`, plus
`SQUARE_ENVIRONMENT=production` and the production Application ID
`sq0idp-Nfm7Aa6OLGRNSuLR3FuKEA` (app "Victoria Royals" in the Developer
console — a public client-side value, needed later for the Web Payments
SDK). The names "Island Canteen / Island Slice / TacoTacoTaco" from the
CSV era have already been renamed to "Concession 1/2/3" in Square, which
is exactly the rename the build doc warned about — good thing nothing keys
off names. **Still open:** which Concession was which old name, for the
heat-map `SQUARE_STAND_SLOT_{1,2,3}_HEATMAP_KEY` link. Slot 4 is set. Check
the three live menus once the token is in (tacos → TacoTacoTaco, pizza →
Island Slice) and set the other three.

**Resolved — Ordering Stations exist, and they are readable without the
dashboard.** Square Online → site "SOFMC Fan Deck In Seat Ordering" (site
id `626096579235952832`, catalog site `796295593842510777`, live at
`sofmc-fan-deck-ordering.square.site`, published Feb 4 2026, accepting
orders) → Fulfillment → QR code ordering → SOFMC ReMax Fan Deck:

| Seat group | Seats |
|---|---|
| Section 107 | 254 |
| Section 108 | 317 |
| Section 109 | 324 |
| Section 110 | 312 |
| Section 111 | 255 |

Station naming is "Row & Seat" with custom names: e.g. full label
`Section 107 A1`, row letter + seat number. The build doc's fear that this
would turn into manual data entry is **off the table**: the storefront's
own public, unauthenticated CDN endpoint returns the groups *and* seats:

```
GET https://cdn5.editmysite.com/app/store/api/v28/editor/users/130333772/sites/626096579235952832/store-locations/11eb8ce8cd026620b3ac0cc47a2ae330/seat-groups
```

(`11eb8ce8…` is Square Online's internal id for the Fan Deck location, not
the Square location ID.) Each group has `seats.data[]` with `id`, `type`
("A1"), `full_label` ("Section 107 A1"), `enabled`, `station_name`,
`seat_group_name`. Verified with curl from this machine with no cookies.
**Caveat:** this is Square Online's internal storefront API, not the
documented Square REST API — there is still no documented Ordering
Stations endpoint. And `seats` comes back paginated at 10 per group with
no `next` link; `page`/`per_page`/`seats_per_page` params didn't change
that. Two options for `stations.ts`: (a) live-read the section list +
per-section counts from this endpoint (works today) and keep row/seat as
validated free text, or (b) find the storefront's own seat-lookup call
(the "customers manually enter their ordering station" flow) to get the
full list. (a) is enough to ship; (b) is a nice-to-have.

**Resolved — webhook creation works at this access level.** The Developer
console's Webhooks → Subscriptions page shows "Add subscription" and one
existing subscription named "Prod" pointing at
`api.wisevenue.com/concessions/we…`, status **Disabled**, 2 events — a
previous vendor's integration, left untouched. So push updates are
available if we want them; still no receiver in this codebase.

**Noted from the Fan Deck QR-ordering settings** (read-only):
- QR ordering hours: 12:00 am–11:59 pm every day (Sat to 11:00 pm) — i.e.
  no hours-based gating in Square; the staff open/close at `/staff` is the
  real gate, as designed.
- Alcohol: "Serving alcohol", limit **"No maximum"** (`alcohol_max_per_order:
  0`). Square is NOT enforcing the 2-drinks / 1-if-24oz rule — our
  server-side check in `/api/orders` is the only enforcement. Keep it.
- Text message alerts: Order Received on, Order Ready off.
- Order tickets: print immediately.
- Live menu categories on the Fan Deck site: Most popular, Beer, Liquor,
  NA Bev, NA Bev PST Exempt, Snacks, Wine Cider & Coolers, Food. The
  current public site tells fans to *type* section/row/seat when ordering
  (the same fallback this app uses today).

### Later the same day — token in, app run live for the first time

Luke pasted the production access token into `.env.local`. Everything
below was run against Eventium's **production** account (there is no
sandbox copy of the catalog). Read-only except where noted — **no Square
order was created**; that's the one step left for Luke to green-light.

**Fixed — the live catalog read was broken for this account.** The
previous `fetchLiveCatalog` made one unpaginated `/v2/catalog/search`
call. Eventium's shared catalog has 1000+ objects across 62 locations and
396 categories, so that call returned a near-empty menu (6–10 items per
stand, missing Draft Beer, Sandwiches, Tacos, Pizza…). Rewritten in
`src/lib/square/catalog.ts` to use `/v2/catalog/search-catalog-items`
with `enabled_location_ids` (paginated; ~20 items per stand, one page)
plus one `/v2/catalog/batch-retrieve` for the referenced categories and
taxes. Two calls per menu read instead of one, and now correct.

**Fixed — categories.** Live items don't set the deprecated `category_id`;
they carry 1–7 `categories` (site-specific junk like "TacoTacoTaco Online",
"1. Beverages") plus exactly one `reporting_category` (Food, Beer, Liquor,
NA Bev, NA Bev PST Exempt, Snacks, Sweets, Wine, Cider & Coolers, Extras).
Menus now group by `reporting_category`, falling back to `categories[0]`,
then `category_id`. Two items ("Chicken Burger", "Pizza - Whole" at
Concession 2) have no category at all and land in "Other".

**Verified live (answers to the Aug 25 open questions):**
- Locations: all 4 IDs resolve, ACTIVE, CAD, card processing enabled.
- **Liquor Tax exists and is named exactly "Liquor Tax" (10%)** — the
  alcohol gate keys off it correctly. Draft Beer, Cans of Beer, Boozy
  Coffee, Wine by the Glass, Cider & Coolers all carry it.
- Other taxes: GST 5%, PST 7%, plus a **"Credit Card Processing Fee" 3.5%
  tax that is disabled** and attached to most items — `estimateLineTax`
  already skips disabled taxes; Square's Orders API won't apply it either.
- **`ecom_visibility` is in use**: mostly VISIBLE, with UNAVAILABLE on Hot
  Dog, Highballs, Cotton Candy, Sides, Extras, Walking Taco, Tequila
  Slushy — those are now correctly hidden. `ecom_available` is a separate
  flag (false on Hot Drinks, which the Fan Deck site still shows), so
  visibility stays the gate.
- **`location_overrides[].sold_out` is actively used** — e.g. 11 of 17
  Wine by the Glass variations sold out at the Fan Deck, 3 Juices at every
  stand. That's the field Square's dashboard "Sold out" toggle writes, so
  question 3 from Aug 25 is answered by the data. Variations can also be
  absent at a location independently of the item (Cans of Beer: 15
  variations, 3–4 orderable per stand) — now filtered too.
- Heat-map keys inferred from live menus and set in `.env.local`:
  Concession 1 sells Burgers/Chicken Tenders → Island Canteen; Concession
  2 sells Pizza → Island Slice; Concession 3 sells Tacos → TacoTacoTaco.
  Correct these if Eventium says otherwise; heat-map only.

**App run end to end on live data** (`npm run dev`, curl + browser):
`/api/stands` returns the four stands with live names; `/api/menu` returns
17 / 17 / 15 / 15 orderable items with the categories above; the order
panel renders real prices (Cheeseburger $11.99, SP Lager 12oz $8.49 /
24oz $16.99…). Server-side order gates against live data: 3×12oz beer →
400 limit-2; 24oz + 12oz → 400 limit-1; unknown variation → 409; section
112 → 400; non-launch location → 400. All stop before `createOrder`.

**Not done, deliberately:** a successful `/api/orders` call would create a
real open order at a real Eventium stand. Needs Luke's go-ahead (and
ideally a heads-up to Eventium) — or a sandbox account with a copied
catalog. Same for payments.

### Same day, later — Luke's review fixes + game-day posture

- **Drinking age badge: 21+ → 19+** (BC). `OrderPanel.tsx`. That was the
  only age string in the app; the gate itself is unchanged.
- **"Add" buttons looked sold-out.** They were flat grey via an inline
  `style`, which also can't express `:hover`. Now a `.btn-add` class in
  `globals.css`: gold outline at rest, fills gold on hover/focus, and when
  the stand is closed they're dimmed + struck through (`:disabled`), next
  to the existing "closed online ordering" banner. Cart +/− got the same
  treatment (`.btn-qty`). Verified in the browser in both states.
  (Gotcha hit on the way: Turbopack on this OneDrive path didn't pick up
  the CSS edit until the file was touched a second time.)
- **FAIL CLOSED.** `isOrderingOpen()` in `staffState.ts` used to return
  `true` when no override and no cutoff were set — i.e. every stand was
  open to the public URL 24/7 by default. Now `false`: a stand takes
  orders only when staff flip it Open at `/staff` (or a cutoff is set and
  hasn't passed). Verified: fresh state → all four stands closed; POST
  `manualOverride: "open"` → open; order gate returns 409 while closed.

**Game-day runbook (how ordering is actually turned on and off):**
1. Before doors, a staff member opens `/staff` (passcode = `STAFF_PASSCODE`)
   and, per stand, either taps **Open**, or sets tonight's **scheduled
   cutoff** (e.g. start of 3rd period) and then taps Open. Cutoff alone
   also opens the stand until that time.
2. During the game the stand shows OPEN; fans can add to cart and place
   orders. Sold-out is live from Square's toggle on the register.
3. Last call: tap **Closed** on that stand (or let the cutoff pass).
   Everything already in a fan's cart is rejected at "Place order" with
   "not currently accepting online orders" (409) — no client trust.
4. Post-game: nothing to do. Stands stay closed until the next game.
   "Clear override, follow schedule" resets a stand to the default, which
   is now closed.
5. Not built and worth deciding: an auto-open (e.g. from a game schedule)
   and a "kitchen/register acknowledged" step. Today both are humans.

### Sep 8, 2026 — Vercel wiring + durable staff state

**Vercel.** The repo is already linked to Vercel project `royals-hackathon`
(team `lukethomas27s-projects`): `main` auto-deploys to production at
`royals-hackathon.vercel.app`, every PR gets a preview. As of this morning
the project had **zero** environment variables, so production was serving
the mock stands. Added via `vercel env add` to Production + Preview: the
13 non-secret vars (`SQUARE_ENVIRONMENT`, `NEXT_PUBLIC_SQUARE_APPLICATION_ID`,
the 4 `SQUARE_STAND_SLOT_*_LOCATION_ID`, the 3 `SQUARE_INSEAT_*`, the 4
`SQUARE_STAND_SLOT_*_HEATMAP_KEY`). **Luke still has to add, as Sensitive:
`SQUARE_ACCESS_TOKEN` and `STAFF_PASSCODE`.** Without the token the deploy
runs on mock data; without the passcode `/staff` is public.
(`vercel link` also appended a `VERCEL_OIDC_TOKEN` line to `.env.local`;
harmless, gitignored.)

**`@vercel/kv` → `@upstash/redis`.** Vercel KV is deprecated (npm warns on
install), so `src/lib/staffState.ts` now uses the Upstash REST client
directly. Accepts either env naming — the Marketplace integration's
`KV_REST_API_URL`/`KV_REST_API_TOKEN` or Upstash's
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Same key layout as
before, so an existing store carries over. **New behaviour: in production
(`VERCEL=1` or `NODE_ENV=production`) with no Redis configured, the staff
state code throws instead of silently using the on-disk file** — verified
with `next start`: `/api/stands` and `/api/staff/status` return 500 with a
message naming the missing env vars. Dev file fallback unchanged and
re-verified. **Action for Luke: Vercel → Storage → Upstash Redis
(Marketplace, free tier is fine) → connect to this project.** Until that's
done, a deploy of this branch will 500 on the stand list — deliberately.

**`next.config.ts`: `turbopack.root` pinned to the repo.** `npm run build`
was failing locally because Next inferred the workspace root as the OneDrive
*Documents* folder (a stray `package-lock.json` lives there) and then timed
out resolving `react` through OneDrive cloud files (os error 426). Pinning
the root fixes it; Vercel never hit this. Build now passes: 10 routes, all
`/api/*` dynamic.

**Still open:**
1. Payment capture (Web Payments SDK + Payments API). Unblocked: app ID is
   in `.env.local` as `NEXT_PUBLIC_SQUARE_APPLICATION_ID`.
2. `stations.ts`: wire the public seat-groups endpoint (above) for the
   live section list; optionally find the storefront's per-seat lookup.
3. ~~`@vercel/kv` is deprecated~~ — swapped to `@upstash/redis` on Sep 8
   (see above); the store itself still needs provisioning in Vercel.
4. Pre-existing dev-only React hydration warning on `/` — floating-point
   SVG coordinates in `ArenaMap` differ in the last digit between server
   and client. Cosmetic; round the coordinates to fix.
5. `.claude/launch.json` added so the in-app preview can start `npm run dev`.

---

# Build status — Aug 25, 2026 (previous)

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
