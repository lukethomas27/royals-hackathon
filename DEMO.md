# Demo notes — showing ArenaPulse to the SOFMC / Eventium team

Written Sep 9, 2026. A formatted version of this page for sharing with the
Royals is at:
https://claude.ai/code/artifact/62e686c9-723e-4491-bfb0-19409f8ac6fb

`STATUS.md` is the technical state. `HANDOFF.md` is the account transfer.
This file is what you say in the room.

## Before the room

The public Vercel deployment has **no Square token** and **no Redis store**
yet, so `royals-hackathon.vercel.app` currently returns an empty stand
list. **Demo from a laptop**, not the public URL:

```bash
npm run dev
```

`.env.local` already has the production token, so `localhost:3000` is
reading Eventium's real catalog. Open two tabs:

- `localhost:3000` — the fan view
- `localhost:3000/staff` — enter the passcode, confirm all four stands read
  CLOSED

Narrow the fan tab to phone width. If someone with register or dashboard
access is in the room, have the Square item list open in a third tab — the
sold-out demo below is the one that lands hardest with operations people.

**The one rule: do not press "Place order."** It would create a real,
unpaid open order at a real stand. Every other gate can be demoed safely
because it fails *before* anything reaches Square.

## Run sheet (~15 min)

| Time | Beat | What to do |
|---|---|---|
| 0:00 | **Fan view, closed** | Arena map + list. All four stands closed. "This is 2 pm on a Tuesday. Ordering exists only when your staff turn it on." |
| 2:00 | **Staff opens a stand** | Staff tab → Open on Concession 1. Show the cutoff field as the third-period safety net. Manual switch always wins. |
| 4:00 | **Live menu** | Reload fan tab, open Concession 1. Real categories, real prices. "There is no menu file in this app." |
| 6:00 | **Sold out, live** | *(needs dashboard access)* Mark a variation sold out in Square → reload → it's gone. Undo after. |
| 8:00 | **Drink limit** | 3× 12oz beer → blocked. Swap for a 24oz → blocked at 1. Show the `19+ · ID CHECKED` tag. "Square's own setting here says no maximum. The app enforces your rule anyway." |
| 10:00 | **Seat delivery** | Open the Fan Deck. Checkout → section 112 refused → 108 / row A / seat 1 accepted. Sections come from the live Square Online seat map (1,462 seats across 107–111). |
| 12:00 | **Stop at the button** | Show "Place order" and the note under it. Don't press. "This is the line we haven't crossed." |
| 13:00 | **Last call** | Staff tab → Closed. Fan tab: Add buttons struck through, order refused. "The app doesn't trust the phone." |
| 15:00 | **Asks + next steps** | Below. Leave with owners and a test-order date. |

## What's real vs. not (say this early)

**Real, against the live Square account:** four stands keyed by location ID;
live menus, prices, categories, sold-out; alcohol detected by Liquor Tax
(not the unreliable "contains alcohol" flag); 2-drink / 1-if-24oz limit
enforced server-side; delivery restricted to 107–111; staff open/close with
closed-by-default; orders created against the correct stand so revenue
reports out of the right concession.

**Not built:** payment capture (the blocker), the "text me when ready" SMS,
a proper seat picker (fans type row/seat today), and no real order has ever
been placed.

**Do not print QR codes until payment is live.**

## Seven asks — none need a developer to answer

1. **Confirm the drink rule.** We enforce 2 per order, 1 if any is 24oz.
   Square's Fan Deck config says *no maximum*. Which is policy? Same for
   pickup and delivery? → SOFMC
2. **How does a stand see an incoming order?** Orders land as open orders in
   Square. Fan Deck prints tickets immediately; do Concessions 1–3 have a
   printer/KDS, or does someone watch the register? Decides whether we need
   an alert screen. → Eventium
3. **Who texts the fan?** We collect the number and opt-in but send nothing.
   Square's own notifications (needs testing on API-created orders), our own
   SMS service, or drop the promise and use order numbers on a board. → Eventium
4. **Pick a test-order window.** Quiet non-game hour, someone at the Fan Deck
   register. One small order through the app, confirmed, then voided. → SOFMC
5. **Which old stand is which?** Heat map only. We inferred Concession 1 =
   Island Canteen, 2 = Island Slice, 3 = TacoTacoTaco from the menus. Yes or
   a correction. → Eventium
6. **Domain + QR plan.** A Royals-owned address (e.g.
   `order.victoriaroyals.com`), where codes go, who prints. → Royals
7. **Who owns the accounts?** Hosting and code are on Luke's personal
   accounts. Need a named owner on the Royals side; then it's a one-hour
   transfer per `HANDOFF.md`. → Royals

## Next steps, in order

1. Paste the Square token + connect Upstash Redis in Vercel, redeploy —
   public site goes from empty to live. *(us, no dependencies)*
2. **Build payment capture** — Web Payments SDK client-side, `/v2/payments`
   server-side against the order ID `/api/orders` already returns. Sandbox
   first. *(us, the real blocker)*
3. First real order at the Fan Deck, then void it. Confirms the ticket
   prints, the seat shows, the ID-check note is visible. *(us + SOFMC, needs
   ask 4)*
4. Wire the "order ready" notification. *(us, needs ask 3)*
5. Proper seat picker from the live seat list. *(us, lower priority)*
6. Move accounts to Royals ownership per `HANDOFF.md`. *(needs ask 7)*
7. Domain on the project, QR codes printed. *(Royals, needs payment live)*
8. Soft launch: one game, one stand, staff briefed. *(everyone)*

## Game-day routine, once live

- **Before doors:** shift lead opens `/staff`, taps Open per stand,
  optionally sets tonight's cutoff.
- **During:** nothing. Sold-out comes from the register as usual.
- **Last call:** tap Closed. Open carts on phones are refused.
- **After:** nothing. Stands stay closed until next game.

## Known risks, worth naming yourself before they ask

- One shared staff passcode, no per-person audit trail. Treat it like a door
  code: shift leads only, rotate each season and when someone leaves.
- If Square is unreachable the app has nothing to sell and says so. It never
  falls back to a stale menu.
- Stand names in Square will keep changing (they already did once). The app
  handles it; printed material won't.
