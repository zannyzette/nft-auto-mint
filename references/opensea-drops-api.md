# OpenSea Drops API — Allowlist Mint Without SIWE (worked: GreedCats 2026-08)

OpenSea-managed allowlist mints (e.g. "Partner Collection Access Allowlist") are gated by OpenSea's BACKEND, not on-chain. The clean way to mint them programmatically is the public **drops API** — no gql.opensea.io, no SIWE cookie auth, no Cloudflare bypass. Just an API key.

## Why this beats the gql.opensea.io blueprint (Zun)
- `gql.opensea.io/graphql` + SIWE cookie flow is the OLD internal path — Cloudflare-blocked from a datacenter VPS (auth.opensea.io 302s, chunks 403), endpoints unstable.
- The **public drops API** needs only `X-API-KEY` (ApiKeyAuth) — works from any VPS.

## Endpoints (verified via api.opensea.io/api/v2/openapi.json)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/drops/{slug}` | GET | Drop info: stages, timing, price, supply |
| `/api/v2/drops/{slug}/mint` | POST | **Build mint tx** — the core call |
| `/api/v2/drops/{slug}/eligibility` | GET | Per-stage eligibility for AUTHENTICATED wallet (needs WalletAuth/SIWE — skip) |

### `POST /api/v2/drops/{slug}/mint`
Request body: `{"minter": "0x...", "quantity": 2}` (minter = wallet that RECEIVES the NFT).
Response (200): `{"to": "<contract>", "data": "<hex calldata>", "value": "<wei hex>", "chain": "<slug>"}` — ready-to-sign; the OpenSea allowlist signature is already baked into `data`.

Status codes:
- `200` → eligible + calldata returned
- `401` → missing API key (`X-API-KEY` header)
- `409` → drop/stage not currently active (not started / ended)
- `422` → **wallet not in allowlist** (or insufficient balance) — this is your per-wallet eligibility check
- `404` → slug/drop not found

## Flow (per wallet)
```
1. POST /drops/{slug}/mint {minter, quantity}   (X-API-KEY header)
2. 200 → sign tx locally (PK from .env, chainId from response "chain" → 4663 = Robinhood)
3. broadcast (fan-out RPCs) → verify receipt
4. 422 → skip (not eligible) · 409 → retry after stage opens
```

## Script
`scripts/opensea-drop-mint.js` — loops all wallets, logs eligible/not-eligible, signs + broadcasts. (Source: /home/ubuntu/mint-wallets/greedcats-drop-mint.js.)

## ✅ PROVEN WORKING — dashboard key approved, 14/14 wallets minted (Cyclops Eyrix, 2026-08-15)

The dashboard API key (`opensea.io/settings/developer`, ~1 day approval) **works for drops-API minting on public SeaDrop stages too — not just allowlists.** Previously blocked on "no key"; now the key is stored in `/home/ubuntu/mint-wallets/.env` as `OPENSEA_API_KEY` (chmod 600) and the full loop is verified:

```
POST /api/v2/drops/{slug}/mint  {minter, quantity:1}   (X-API-KEY header)
→ 200 {to, data, value}  →  sign locally (chainId 4663, gasLimit 400000)
→ broadcast → 14/14 wallets ✅ SUKSES (gas ~121.5k each, value 0.0001 ETH)
```

**Key facts from the worked run (cyclopseyrixnft):**
- Drop type `seadrop_v1_erc721`, `is_minting: true`, active_stage `public_sale`, price 100000000000000 wei, max_per_wallet 10.
- The response's calldata goes to a **wrapper contract** (not the SeaDrop directly) with an embedded OpenSea signature — sign it as-is, do NOT try to decode/rebuild.
- **The same endpoint works for plain PUBLIC stages**, not just allowlists — this is now the default path for ANY OpenSea-hosted mint (check `GET /drops/{slug}` first; if it 200s with `active_stage`, use drops API).
- Detection shortcut when a "SeaDrop public" sim reverts: see `references/opensea-drops-api-recon-detect.md` (wrapper + embedded sig = drops-API managed).
- Working script pattern saved as `scripts/opensea-drop-mint.js` (generic SLUG + wallet loop).

## Pitfalls
- **Eligibility pre-stage:** `/mint` returns 409 before the stage opens (can't pre-check eligibility via this endpoint); `/eligibility` needs SIWE (Cloudflare-blocked from VPS). The reliable "check all wallets" = loop `/mint` AT stage-open (200/422 = eligible/not in one shot).
- **"Accessible collection list" wording** (Genesis Agent 2026-08, also GreedCats "Partner Collection Access"): when a project FAQ says eligibility needs an "accessible collection list" / holding a collection, it's a holder-gated allowlist. Our 10-wallet fleet holds ~10 Robinhood collections — when the list is announced, check which of ours is the gate, then all 10 wallets are likely eligible.
- **API key sourcing:** instant key (`POST /api/v2/auth/keys`) rate-limits hard per-IP (~3/day); dashboard key needs ~1 day approval. Save the key to `.env` immediately (see SKILL.md key-handling rule). **Accept HTTP 201 too** (not just 200) on key creation — and write the response to a NEW file each attempt (a retry loop that reuses one output file can overwrite a good key with a 429 error body).
- **OpenSea page via jina:** `https://r.jina.ai/https://opensea.io/collection/<slug>` shows the mint schedule block (stages, start times, FREE/price, limits, ELIGIBLE markers) — direct curl to opensea.io and its `_next/static/chunks/*.js` are both 403. Don't bother with chunks.
- **On-chain params may be EMPTY for OpenSea-managed allowlists** (OpenSea signs server-side) — see `references/opensea-managed-allowlist.md` for the diagnostic recipe (decode owner `multiConfigure`, check `getSignedMintValidationParams`, `getTokenGatedDrop`). Do NOT conclude "no allowlist" from empty params when the OpenSea page shows an ELIGIBLE stage.
- **Not all allowlists are OpenSea-managed** — token-gated (SeaDrop `mintAllowedTokenHolder`) and project-signed allowlists have different paths. Drops API only covers OpenSea Creator Studio drops.
