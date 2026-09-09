# Square integration validation — 2026-09-08

Outcome: blocked at check 1; no live validation completed. No Square mutations, test orders, inventory changes, or application code changes were made.

## Direct browser access verification — Sep 8 evening PDT

Using Aashna's signed-in Chrome session, confirmed the Square Dashboard account display name is RG Facilities (Mission) Ltd and its location table includes SOFMC Concession 1, SOFMC Concession 2, SOFMC Concession 3, and SOFMC ReMax Fan Deck. The Developer Console lists Victoria Royals with the expected application ID, and its production credentials page is accessible (token masked; not copied).

Opened Webhooks → Subscriptions and the Add a webhook subscription form successfully. Existing Prod subscription points to the previous vendor and is Disabled; left unchanged. The creation form requires a name, notification URL, API version and selected events. No subscription was saved, so actual creation permission remains unverified. An application-owned notification destination must be established to complete that test; no receiver exists in the reviewed repo. Account/browser access is now confirmed; local API credential configuration is still outstanding.

## Update after fetching Luke's latest pushes

Fetched origin successfully on Sep 8. Latest main is `0527032` (merged PR #3, live-square-verification). Reviewed its STATUS.md, HANDOFF.md and integration diffs without overwriting the existing working tree. The results below are code inspection and Luke's committed account observations, not new authenticated testing from this machine. Local credential availability is unchanged.

| # | Updated assessment | Evidence at origin/main `0527032` |
|---|---|---|
| 1 | Still unverified | STATUS.md labels webhook creation resolved, but evidence is only an Add subscription button and an existing disabled vendor subscription. No creation response or actual creation test is recorded. This does not satisfy the requested gate. |
| 2 | Partial discovery; integration unfinished | Luke reports a public Square Online storefront seat-groups endpoint with sections 107–111. It is undocumented and returns only 10 seats per group with unresolved pagination. stations.ts still returns unavailable. Neither a complete live seat map nor dashboard-only status is established. |
| 3 | Partially verified by Luke; code fixed | catalog.ts now paginates SearchCatalogItems by location, batch-retrieves tax/category references, and filters variations by location. Notes identify Hot Dog as UNAVAILABLE. selfServeEnabled still defaults true; full self-serve/dashboard comparison remains unproven. |
| 4 | Partial evidence only | Notes record existing sold_out overrides. No controlled dashboard toggle/zero-count test with before/after fan-menu observations is recorded. inventoryCount remains null. |
| 5 | Partial live evidence reported | Notes confirm Liquor Tax at 10% and assignment to Draft Beer, Cans of Beer, Boozy Coffee, Wine by the Glass, and Cider & Coolers; reported server rejections cover 3 standard drinks and mixed 24oz/12oz. Full requested item coverage, including Highballs and Tequila Slushy, remains undocumented. |
| 6 | Not tested | Notes explicitly say no real order has been created. All four IDs were reportedly resolved as active CAD locations; this is not order attribution evidence. |
| 7 | FAIL — implementation absent | Latest STATUS.md and HANDOFF.md explicitly confirm payment capture is not built; order/payment modules were not changed by these pushes. |
| 8 | Partial findings; client work remains | Notes say Pizza - Whole has no category and renders under Other. catalog.ts still passes the raw category name, including NA Bev PST Exempt, without a rename/suppression mapping. Duplicate slushy status is not recorded. |

### Revised priority

1. Deployment configuration: latest committed notes say production SQUARE_ACCESS_TOKEN and Redis provisioning remain missing; STAFF_PASSCODE is set for production. Without Redis the new production code errors on stand reads. These are recorded configuration observations, not a fresh Vercel inspection.
2. Actual webhook creation verification remains the user's gate for further feature work. Credentials are still unavailable locally; Luke's gitignored .env.local does not travel with a push.
3. Payment capture is still absent; four successful location-specific test orders remain outstanding.
4. Resolve seat endpoint completeness/support and implement the agreed approach; finish controlled sold-out testing, self-serve mapping, full alcohol coverage and data-quality checks.

Luke's upstream changes include src/lib/square/catalog.ts, src/lib/square/client.ts, src/lib/staffState.ts, src/components/OrderPanel.tsx, src/app/globals.css, src/app/staff/page.tsx, dependency/config files and handoff documentation. Staff persistence now uses @upstash/redis with legacy KV environment names accepted, and production refuses local-file fallback. No new application code was changed in this validation session.

---

## Original blocked-pass evidence and scope

Read the working-tree STATUS.md first. Local main is three commits behind the cached origin/main; package-lock.json has an existing modification and .claude/ is untracked. Neither was changed. This checkout is not evidence of the current deployment.

Credential discovery checked environment variable names/presence only and .env* files directly in /Users/aashna/DV and /Users/aashna/DV/royals-hackathon. Results:

```text
Environment variable presence: {}  # names containing SQUARE or VERCEL
No .env* files found in either checked directory
Vercel project linked: False
```

This establishes that credentials are unavailable through these local sources, not that they do not exist in Vercel or elsewhere. No authenticated Square request was attempted, so there is no HTTP status, response body, or permission error to escalate to Square.

Square documents that the Webhook Subscriptions API requires the application's personal access token and does not accept OAuth access tokens. A dashboard Administrator role does not by itself prove this capability. Source: https://developer.squareup.com/reference/square/webhook-subscriptions-api

## Ordered check results

| # | Check | Status | Evidence / limitation |
|---|---|---|---|
| 1 | Webhook creation | BLOCKED — not tested | Credentials unavailable to this shell through the checked sources. Administrator role and subscription creation remain unverified. |
| 2 | Ordering Stations API exposure | NOT TESTED | Held at check 1 gate; neither API availability nor dashboard-only status is established. |
| 3 | Online visibility / self-serve mappings | NOT TESTED | Held at check 1 gate; no live catalog/dashboard comparison. |
| 4 | Sold-out / inventory propagation | NOT TESTED | Held at check 1 gate; no inventory or dashboard mutation. |
| 5 | Alcohol gating | NOT TESTED in this pass | Held at check 1 gate; STATUS.md claims Liquor Tax gating and quantity enforcement, but this is not live evidence. |
| 6 | Four location test orders | NOT TESTED | Held at check 1 gate; no orders placed. |
| 7 | Payment capture | NOT TESTED in this pass; prior documented blocker | STATUS.md explicitly says orders are created without charging a card. Treat payment capture as a launch blocker until current implementation and end-to-end capture are verified. |
| 8 | Catalog data quality | NOT TESTED | Held at check 1 gate; duplicate slushy, missing pizza reporting category, and accounting category display remain unverified. |

BLOCKED and NOT TESTED are not API failures or passes. Reporting a pass/fail for these would invent evidence.

## Changes

Only this report was added. No integration, staff-state persistence, or menu behavior was changed.

## Prioritized launch blockers

1. Make the Eventium application's credentials accessible to the execution environment and complete webhook creation verification. If creation fails, retain the exact sanitized HTTP response for client escalation. Also establish the intended application-owned notification URL for the test.
2. Confirm and implement/test payment capture: prior documented implementation only creates unpaid orders.
3. Resolve Ordering Stations exposure and the seat-picker approach; dashboard-only data would require an explicit scope decision, not a hardcoded seat map.
4. Complete live catalog visibility/self-serve, sold-out propagation, alcohol assignment/limits, and four-location order attribution checks in the requested order.
5. Verify and resolve the client catalog data issues before a clean launch. Previously reported branding assets remain outside this validation pass.
