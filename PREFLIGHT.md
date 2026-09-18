# Preflight — first real test order at SOFMC, Sep 18 2026

Written the night of Sep 17/18. This is the checklist for the test at the
arena: what has to be true before you leave, what to check in the morning,
the exact order of operations at the stand, and how to undo it. `STATUS.md`
has the history, `DEMO.md` the talk track, `HANDOFF.md` the ownership move.

Tick the boxes as you go. Every command runs from the repo folder.

## 0. Where we stand (verified tonight, Sep 18 ~00:30–01:30 PT)

| Area | State |
|---|---|
| Local code | `main` merged with Aashna's Sep 9 commits + the Sep 14 rehearsal fixes + tonight's payment work. `tsc` clean, lint = 2 pre-existing nits. |
| Live Square reads (laptop) | 4 stands resolve; menus 17/17/15/15 items; categories ordered Food → … → NA Bev; Liquor Tax 10% found; 24oz variants only at the Fan Deck. |
| Server gates (laptop, live data) | 24/24 pass: auth 401/200, closed-by-default 409, 3 alcoholic → 400, 24oz+1 → 400, unknown variation 409, bad phone 400, empty cart 400, unknown stand 400, no seat 400, section 112 400, blank row 400, cross-stand item 409, past cutoff 409, future cutoff opens, no card 400, bad promo 400, qty 0 400. All stop before Square. |
| Checkout UI (laptop, production SDK) | Card field renders; coupon applies → $0.00, card hidden; Place order not pressed. |
| Production URL | **LIVE as of ~02:40 PT**: `/api/health` = `ok` (square, redis, payments, passcode, coupon all true); four live stands, all CLOSED; staff 401/200; closed-stand gate 409 verified from outside. Deployment `2hlnk3j3d` of commit `ed1058c`. |
| Square order creation | Payload matches Square's fulfillment rules; **proven in the sandbox** (§6): pickup + delivery orders created, paid by card and by coupon, declined card cancels the order. Never run against production yet. |
| Payment | Card via Web Payments SDK + CreatePayment, and a 100% coupon (`ROYALS-TEST-0918`) that marks a $0 order paid. Both new tonight, both verified in the sandbox incl. the real browser card field. |

Square fact that shaped everything: **an API order only appears on the
register, Order Manager or kitchen printer once it is PAID.** That is why
tomorrow's order must be paid (card or coupon), not just created.

## 1. Tonight, before you sleep

Two things only you can do, then the rest is mine to run and verify.

- [x] **Vercel login** (done ~01:40, CLI logged in as lukethomas27):
  ```bash
  npx vercel login
  ```
- [x] **Sandbox credentials** into `.env.sandbox` (done) (gitignored): Developer
  console → app "Victoria Royals" → toggle **Sandbox** → Credentials →
  paste the sandbox *Access token* and sandbox *Application ID*
  (`sandbox-sq0idb-…`). I never echo these.
- [x] I then run, and record results in §6 (done, see §6):
  ```bash
  npm run sandbox:seed
  ```
  ```bash
  npm run dev:sandbox
  ```
  Card order (test Visa 4111…), declined card (4000 0000 0000 0002),
  coupon order, delivery order with seat, 24oz + 1 rejected. Each paid
  order must show `state: COMPLETED`/paid in the sandbox dashboard.
- [x] **Vercel wiring** — all done: 13 vars + passcode + `SQUARE_ACCESS_TOKEN` + `ORDER_PROMO_CODE`, Upstash Redis provisioned via Marketplace and connected (injects `KV_REST_API_URL`/`KV_REST_API_TOKEN`), redeployed, verified:
  1. `vercel env ls` — confirm the 13 non-secret vars + `STAFF_PASSCODE`.
  2. Storage → **Upstash Redis** (Marketplace, free) → connect to
     `royals-hackathon`, all environments. I confirm before accepting terms.
  3. **You:** Settings → Environment Variables → `SQUARE_ACCESS_TOKEN`
     (Production, **Sensitive**) = the production token from `.env.local`.
  4. Me: add `ORDER_PROMO_CODE=ROYALS-TEST-0918` (Production).
  5. Push `main` → auto-deploy → verify from outside:
     ```bash
     curl -s https://royals-hackathon.vercel.app/api/health
     ```
     must be `{"status":"ok", …, "payments":true, "redis":true, "promoCodeActive":true}` and
     ```bash
     curl -s https://royals-hackathon.vercel.app/api/stands
     ```
     must list the four live stand names, all `isOpen:false`.
- [ ] Production smoke, no order: open the URL on your phone (cellular),
  open `/staff`, log in, all four CLOSED; open a stand; fan page shows the
  live menu; checkout shows the card field; **stop there**; close the stand.

## 2. Morning of

- [ ] `git status` clean, `git log -1` shows tonight's commit, Vercel
  dashboard shows the same commit deployed to Production.
- [ ] `/api/health` on the production URL still `ok`.
- [ ] `/staff`: all four CLOSED. If not, Force Closed then "Clear override".
- [ ] Phone on **cellular** loads the production URL in < 3 s and shows
  four stands. Arena Wi‑Fi is unknown; bring a hotspot anyway.
- [ ] Laptop backup: `rm -rf .next && npm run dev` still works with
  `.env.local` (same code, same Square account) if Vercel misbehaves.
- [ ] Know who at SOFMC can: (a) see the Fan Deck register / Order
  Manager, (b) void or refund an order, (c) mark an item sold out.
- [ ] Have a real card you can refund to (card test) and the coupon code.

## 3. At the stand — order of operations

Do the coupon order first (no money moves), then one card order if the
coupon order behaved. Fan Deck first because it has the printer.

1. **Staff opens the Fan Deck** at `/staff` (phone or laptop). Fan page
   reload shows the Fan Deck without the CLOSED badge.
2. **Coupon order, Fan Deck, delivery.** On the fan phone: Fan Deck →
   add one cheap non-alcohol item (Coffee $3.49) → View cart → section
   108, a real row/seat → name "TEST" → your phone number → promo code
   `ROYALS-TEST-0918` → Apply (total $0.00, card field gone) → **Place
   order · $0.00**.
   - Expect: "Order received · Paid with promo code · $0.00", an order ref.
   - **Register:** the order appears in Orders / Order Manager within
     seconds as a paid $0 delivery order, ticket prints, note shows
     `Seat: Sec 108 Row X Seat Y`, recipient "TEST", phone.
   - If it does not appear within a minute: note the order ref, we look it
     up in Dashboard → Orders (search by ref). Do **not** retry blindly.
3. **Card order, Fan Deck, alcohol.** Add one Boozy Coffee (Single) →
   checkout → the `19+ · ID CHECKED` tag and "have ID ready" note are
   visible → seat → name → phone → **no coupon** → real card → **Pay $x.xx**.
   - Expect: "Paid $x.xx · VISA ····1234", receipt link opens Square's
     receipt, order ref.
   - **Register:** paid order, ticket prints with `ID CHECK REQUIRED AT
     HANDOFF` in the note.
   - Staff **refund** it from the register/Dashboard afterwards (Transactions
     → the payment → Refund). Keep the receipt.
4. **Pickup order, Concession 1** (optional, if time): open Concession 1,
   coupon order with one item, confirm it lands on that register (not the
   Fan Deck's). This is the "revenue reports out of the right stand" proof.
5. **Last call test:** staff taps Closed on the Fan Deck; on the fan phone,
   with an item already in the cart, Place order → "not currently
   accepting online orders". Then reload → Add buttons struck through.
6. **Sold-out test** (if someone has register access): mark Coffee sold
   out on the register → reload the fan menu → Coffee gone; undo.
7. **Close every stand** before leaving. `/staff` all CLOSED.

## 4. If something goes wrong

| Symptom | Likely cause | Do |
|---|---|---|
| Fan page shows "Mock Pickup Stand A" or no stands | Token missing / wrong on Vercel | Fall back to the laptop (`npm run dev`, `.env.local`) via hotspot; fix Vercel later |
| `/api/stands` 500 mentioning "durable store" | Redis not linked | Same fallback; Redis is only needed on Vercel |
| Card field never loads | Ad-blocker / captive Wi‑Fi blocking `web.squarecdn.com` | Switch the phone to cellular, or use the coupon path |
| "Card details are required." on Pay | Tokenize failed silently (rare) | Reload checkout, re-enter card |
| 402 with a decline message | Real decline | Different card, or coupon |
| Order paid but not on register after 1 min | Location mismatch or Order Manager not open at the stand | Dashboard → Orders → search ref; check `location_id`; ask staff to open the Orders tab on the POS |
| 503 "Live seat data is temporarily unavailable" | `SQUARE_ORDERING_STATIONS_URL` set on Vercel and the CDN call failed | Delete that env var and redeploy; fallback validates sections 107–111 |
| 409 "not currently accepting" on a stand staff opened | Redis state and the stand ID disagree, or a cutoff in the past is set | `/staff` → Force Open again; clear cutoff |

Undo for anything paid: refund from the register/Dashboard. Undo for a
coupon order: void/cancel from Order Manager (no money moved).

## 5. After the test

- [ ] **Delete `ORDER_PROMO_CODE` from Vercel** and redeploy. Confirm
  `/api/health` shows `promoCodeActive:false`. Until then anyone with the
  code eats free.
- [ ] Refund/void every test order; keep the receipts and order refs.
- [ ] All four stands CLOSED.
- [ ] Note in `STATUS.md`: did the ticket print, what the register showed,
  how long it took, what staff said.
- [ ] Decide the seven asks in `DEMO.md`; add "who watches Order Manager
  at Concessions 1–3" if they have no printer.

## 6. Sandbox results — Sep 18, ~02:00 PT, Square SANDBOX, port 3001

Seeded: 2 sandbox locations (pickup + fan deck, both at 1925 Blanshard St),
GST/PST/Liquor Tax, 5 items incl. Boozy Coffee and a 24oz draft. All orders
below were created by the app through `/api/orders` and then read back
from Square with RetrieveOrder / SearchOrders.

| # | Case | App response | Square's view |
|---|---|---|---|
| A | Pickup, Coffee + 2 Chips, card (`cnon:card-nonce-ok`) | 200, paid $9.51, VISA ····5858, receipt URL | `PICKUP/PROPOSED`, recipient "TEST" + phone, `schedule_type ASAP`, tender `CARD 951 CAPTURED`, `net_amount_due 0` |
| B | Pickup, declined card (`cnon:card-nonce-declined`) | 402 "Your card was declined." | order **CANCELED**, fulfillment CANCELED (after the fix: cancel fulfillment first, then order, with a re-read version) |
| C | Fan Deck delivery, Boozy Coffee, coupon `ROYALS-TEST-0918` | 200, paidWith `promo`, $0.00, `requiresIdCheck true` | `DELIVERY/PROPOSED`, discount 900 (100% ORDER), total 0, `net_amount_due 0`, address 1925 Blanshard St, note `Seat: Sec 108 Row A Seat 1 \| ID CHECK REQUIRED AT HANDOFF` |
| D | Fan Deck delivery, Boozy Coffee, card | 200, paid $9.00, receipt URL, `requiresIdCheck true` | `DELIVERY/PROPOSED`, tender `CARD 900 CAPTURED`, seat + ID note present |
| E | 24oz draft + Boozy Coffee, card | 400 limit-1 message | nothing created |
| F | Section 112 + card | 400 sections message | nothing created |
| UI | Browser: Fan Deck → Coffee → seat 108/A/3 → name → phone → Square card field, test Visa 4111…, 12/30, CVV 111, ZIP 94103 → **Pay $3.66** | "Order received · Paid $3.49 · VISA ····1111", receipt link, order ref; no console errors | paid card order |

Notes from the sandbox run:
- The card field showed a US-style **ZIP** in the sandbox test account and
  rejected `V8T4J2`; the SDK's error ("Postal code is not valid") surfaced
  in the UI correctly. Production location is CA, so expect a postal-code
  field that accepts letters. If a fan's card is rejected on postal code
  tomorrow, that is the first thing to look at.
- Seeded sandbox items did not get tax applied by Square (total = subtotal),
  so the UI estimate ($3.66) and the charged amount ($3.49) differed. The
  app charges Square's own total and shows that on the confirmation, which
  is the correct behaviour. Eventium's real items carry real taxes.
- `PayOrder` with empty `payment_ids` on the $0 coupon order succeeded
  (`net_amount_due 0`, state `OPEN`, no tender). **Still to confirm by eye:**
  open the sandbox Seller Dashboard (Developer console → "Open sandbox
  dashboard" → Orders) and check that orders A, C, D and the UI order are
  listed and the declined one is not. C is the one that matters — it is
  exactly what tomorrow's first order will be.

## 7. Known limits going in

- Vercel Hobby plan forbids commercial use. A refunded test charge is a
  grey area; move to a paid team before any real sales (`HANDOFF.md`).
- No SMS is sent even though the checkbox says so. Staff call the name /
  deliver to the seat. Decide ask #3 before launch.
- The coupon is a single shared code with no usage limit. It exists only
  for supervised tests.
- 3-D Secure / SCA is left to Square's automatic handling in
  `card.tokenize`; not exercised in sandbox beyond the happy path.
- One shared staff passcode, no audit trail.
