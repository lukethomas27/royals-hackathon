# Handoff — moving ArenaPulse off Luke's personal accounts

Written Sep 8, 2026. Read `STATUS.md` for what the app does and what's
still unbuilt; this file is only about **ownership**: what is currently
tied to Luke personally, what it should be tied to instead, and the exact
order to move it so nothing breaks mid-transfer.

## Where things live today

| Piece | Today | Should end up |
|---|---|---|
| Source code | GitHub `lukethomas27/royals-hackathon` (Luke's personal account) | A GitHub **organization** owned by the Royals (or Eventium), Luke as a collaborator, not owner |
| Hosting | Vercel project `royals-hackathon` on team `lukethomas27s-projects` (Luke's personal Hobby team) | A Vercel **team** owned by the Royals, on a paid plan (Hobby plan forbids commercial use) |
| Square access | Production access token from the Square app **"Victoria Royals"** inside **Eventium's** Square account, app ID `sq0idp-Nfm7Aa6OLGRNSuLR3FuKEA` | Same app — it already belongs to Eventium, not Luke. Only the *token* needs rotating once Luke is out of the loop |
| Square dashboard login | Luke's Eventium dashboard login, scoped to the 4 stands | Whoever operates the app day to day. Luke's login gets removed when he's done |
| Staff passcode | `STAFF_PASSCODE` env var (not yet set) | Set by the Royals' ops lead, known to stand staff only |
| Staff open/close store | Upstash Redis (not yet provisioned) via Vercel Marketplace | Provisioned **inside the Royals' Vercel team**, not Luke's |
| Historical heat-map data | `public/data/games/*.json` in the repo (68 games, frozen CSV export) | Stays in the repo; no account attached |
| Supabase project `arenapulse` | Referenced in `.env.local` only. **Unused by the code.** | Delete it, or ignore it. Nothing depends on it |
| Domain | none — `royals-hackathon.vercel.app` | A Royals-owned domain, e.g. `order.victoriaroyals.com`, added to the Vercel project. This is what goes on the printed QR codes, so decide it **before** printing anything |

## Order of operations

Do these in order. Each step leaves the app working.

### 1. Create the destination accounts (Royals side, 30 min)

- **GitHub organization** (free): e.g. `victoria-royals`. Add Luke as a
  member with admin on this one repo for the duration of the handoff.
- **Vercel team** (Pro plan, ~US$20/seat/month): created by a Royals or
  Eventium staff email, not a personal one. Add Luke as a member for the
  duration of the handoff.
- Decide the **production domain** and who owns its DNS.

### 2. Transfer the GitHub repo (5 min, no downtime)

Luke: repo → Settings → General → Danger Zone → **Transfer ownership** →
the new org. GitHub redirects the old URL, so Vercel's Git integration
keeps working until step 3, and `git remote` on laptops keeps working too
(update it anyway: `git remote set-url origin <new url>`).

Merge or close any open PRs first — transfers carry them over, but it's
cleaner.

### 3. Transfer the Vercel project (10 min, seconds of risk)

Luke: Vercel → project `royals-hackathon` → Settings → General →
**Transfer project** → pick the Royals team. Vercel moves the project,
its deployments, its **environment variables**, and its Git connection.
Things that do **not** transfer and must be redone on the new team:

- **Marketplace storage (Upstash Redis).** If it was provisioned on Luke's
  team, disconnect it first and provision a fresh one on the Royals team
  after the transfer. Staff state is per-game and throwaway, so losing it
  costs nothing — just make sure all four stands read CLOSED afterwards.
- **Domain.** Add it on the new team after the transfer.
- **Deployment Protection / password** settings — re-check them.

After the transfer, re-connect the Git integration to the repo in its new
org (Settings → Git) and trigger a redeploy. Confirm `/api/stands` returns
the four live stand names, not "Mock Pickup Stand A".

### 4. Rotate every secret Luke has seen (15 min)

Do this **after** the transfers so the new values only ever exist on the
Royals' side.

- **Square access token.** Square Developer console → app "Victoria
  Royals" → Credentials → Production → **Replace** the access token. Paste
  the new one into the Royals' Vercel project as `SQUARE_ACCESS_TOKEN`
  (Sensitive). The old token stops working immediately, so do the paste
  in the same sitting. Luke's local `.env.local` becomes useless, which is
  the point.
- **`STAFF_PASSCODE`.** Set (or reset) it in Vercel. Give it to stand
  staff through whatever channel the Royals use for shift info, not chat
  with Luke.
- **Upstash Redis token.** Comes with the fresh store from step 3; nothing
  to rotate if you provisioned new.
- Luke: delete the Square token line from your `.env.local`, and revoke
  the `VERCEL_OIDC_TOKEN` line by unlinking (`rm -rf .vercel`).

### 5. Remove Luke's access (5 min)

- Square dashboard: Eventium admin removes Luke's team-member login (or
  downgrades it to view-only for a support period — your call).
- Square Developer console: if Luke was added as a developer on the app,
  remove him there too.
- GitHub org: drop Luke from admin to write, or remove.
- Vercel team: remove Luke.

### 6. Prove it still works without Luke (10 min, on a non-game day)

From a Royals-owned laptop and phone, not Luke's:

1. Open the production URL. Four stands, all **CLOSED**.
2. Open `/staff`, enter the passcode, tap **Open** on one pickup stand.
3. Reload the fan page. That stand is open; its menu shows real items and
   prices matching the Square dashboard.
4. Tap **Closed**. Reload. Add buttons are struck through, "Place order"
   is rejected.
5. Square Developer console → the app → **API logs**: you should see the
   catalog reads from steps 2–3 coming from the new deployment.

If any of that fails, the problem is almost certainly a missing env var on
the new team — compare against the table in `.env.example`.

## What is deliberately *not* in this handoff

- **Payment capture is not built.** Do not put the URL on a QR code until it
  is, or fans will "order" without paying. See `STATUS.md`.
- **A real order has never been placed through this app.** The first one
  should be a staff test order on a quiet day, voided in Square afterwards.
- **Square webhooks** are not used. There is one disabled subscription in
  the developer console from a previous vendor (`wisevenue.com`); leave it
  or delete it, it has no effect on this app.
- The **Supabase** project in `.env.local` predates the Square build and is
  dead weight. Nothing reads it.

## Contacts and identifiers worth keeping in one place

- Square app: "Victoria Royals", ID `sq0idp-Nfm7Aa6OLGRNSuLR3FuKEA`, inside
  Eventium's Square account (the same account that runs all Eventium
  venues — the 4 launch stands are the only locations this app touches).
- Square location IDs: see `.env.example` / `STATUS.md` (Sep 7 table).
- Square Online site that holds the seat map: "SOFMC Fan Deck In Seat
  Ordering", `sofmc-fan-deck-ordering.square.site`.
- Historical dataset: 68 games, Sep 2024 – Feb 2026, keyed by the *old*
  stand names — only the heat map uses it.
