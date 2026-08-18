# OpenSea API Access — key types, endpoints, limits (verified Aug 2026)

## Instant key creation — pitfalls (2026-08-13, verified)
- `POST /api/v2/auth/keys` `{}` → **HTTP 201** on success (not 200). Parse the response.
- **Hermes masks `api_key` in tool output** — save the key to a file in the SAME shell command that creates it (curl -o file, then parse+write). Once masked, unrecoverable.
- **429 "Too many key creation attempts" is per-IP and long-lasting** (~3 keys/day then blocked 40+ min observed). Don't retry in a loop writing to one file — later 429 bodies overwrite the earlier 201 success.
- Dashboard key (`opensea.io/settings/developer` → Get Access) = manual approval (~1 day). Fill: org/name, website (X/GitHub URL counts), intended use (1-2 sentences), category "Analytics / Research".

## ✅ Dashboard key STATUS 2026-08-15: APPROVED & WORKING
The developer-portal dashboard key got approved and is stored in `/home/ubuntu/mint-wallets/.env` as `OPENSEA_API_KEY` (chmod 600). Verified working: `GET /drops/{slug}` and `POST /drops/{slug}/mint` both 200 (14/14 wallets minted on Cyclops Eyrix). This UNLOCKS drops-API automation for OpenSea-hosted mints (public stages AND allowlists) — previously blocked on "no key". If the key expires/breaks, re-request via the same dashboard path (~1 day approval again).

## Instant free API key (no signup, no wallet)
```
POST https://api.opensea.io/api/v2/auth/keys
→ { "api_key": "...", "name": "agent_free_...", "expires_at": "<7 days>",
    "rate_limits": { "read": "600/h", "write": "30/h", "fulfillment": "5/m" } }
```
- Regenerable anytime; expires after 7 days → recreate.
- Use key in `X-API-KEY` header on all requests.

## What the free key CAN access (verified)
| Endpoint | Result |
|---|---|
| `GET /api/v2/collections/<slug>` | ✅ 200 — collection data |
| `GET /api/v2/collections?chain=robinhood` | ❌ 401 (needs auth) |
| `GET /api/v2/chain/<chain>` | ❌ 404 |
| `GET /api/v2/orders/{chain}/seaport/offers` (any chain) | ❌ 405 even with free key |
| `GET /api/v2/orders/{chain}/seaport/listings` | ❌ 405 |
| `GET /api/v2/account/{wallet}/offers/received` | ❌ 404 |
| `GET /api/v2/chain/{chain}/account/{addr}/nfts` | ❌ 401 (needs full key) |

**Key finding:** the instant free key unlocks collection metadata but NOT order
data (offers/listings). Order endpoints 405 on GET regardless of key tier unless
a full developer-portal key is used. So:
- Offer monitoring + acceptance → need full key (developer.opensea.io) OR manual UI.
- Collection/supply metadata → free instant key is enough for recon.

## Using offers for bulk-sell / accept
- Accepting an OpenSea offer = Seaport `fulfillBasicOrder`/`fulfillOrder` — needs
  the full order object (signature, parameters). That data only comes from
  OpenSea API (full key) or the browser UI ("Copy order data").
- Screenshot of offers shows price only — NOT enough to build a fulfill tx.
- Operator paths: (a) full API key, (b) accept manually in UI, (c) copy order
  JSON from browser network tab → agent builds fulfill tx.

## Gas / network note
OpenSea v2 API on Robinhood chain uses chain identifier `robinhood` in paths;
chain id 4663. Prices may be denominated in USDG (e.g. FUWA sold in USDG) —
check the currency before computing P&L.
# OpenSea API — Instant Key & Orders Access

## Instant API key (free, no signup, agent-friendly)
```
POST https://api.opensea.io/api/v2/auth/keys
```
Returns immediately:
```json
{
  "api_key": "...",
  "name": "agent_free_...",
  "expires_at": "<7 days>",
  "rate_limits": { "read": "600/h", "write": "30/h", "fulfillment": "5/m" }
}
```
- No signup/wallet/human needed. Key expires after 7 days — regenerate on expiry.
- Use as `X-API-KEY: <key>` header on all requests.

## What the instant key CAN do
- `GET /api/v2/collections/<slug>` → collection data (200 OK verified).
- Read endpoints up to 600/h.

## What it CANNOT do (verified 405)
- `GET /api/v2/orders/{chain}/{protocol}/offers` → **405 Method Not Allowed**
  on ALL chains (ethereum/base/arbitrum/robinhood), even with valid key.
- Same for `/listings`. Offers/orders endpoints require a **full API key** from
  the developer portal (`opensea.io/settings/developer` → request key, may need
  manual approval, can take a day).
- Also 405/404: `/api/v2/offers/...`, `/api/v2/orders/4663/...` (numeric chain),
  `/api/v2/orders/{chain}/offers` (missing protocol).

## Implication for "accept all offers" automation
- Accepting an offer = Seaport fulfill, which needs the full order data
  (signature + parameters) that only OpenSea's orders API returns.
- Instant key can't fetch orders → can't build the fulfill tx automatically.
- Until a full key is approved: operator accepts offers manually in the UI
  (1 min per NFT) OR screenshots offer list and agent guides.

## To build full auto-accept
1. Full API key from developer portal.
2. `GET /api/v2/orders/{chain}/{protocol}/offers?recipient=<wallet>` to list incoming.
3. Filter by price threshold, then Seaport fulfill (setApprovalForAll once per
   wallet + fulfillBasicOrder per offer).
