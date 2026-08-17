# Scatter.art Mint Platform — API Flow (worked: FUWA, Aug 2026)

Scatter.art is an artist-first NFT launchpad. Main site `www.scatter.art` is behind
Vercel Security Checkpoint (429 for server curl), but the **API subdomain is NOT
blocked** — all data + mint signing lives on `api.scatter.art`.

## Key discovery
- `www.scatter.art/c/<slug>` → 429 Vercel checkpoint (blocked server-side)
- `api.scatter.art/v1/collection/<slug>` → 200 ✅ (collection data + ABI)
- `docs.scatter.art` → 200 ✅ (full docs, chain IDs, API reference)
- So: **check the `api.` subdomain before assuming a site is unreachable.**

## Collection info
```
GET https://api.scatter.art/v1/collection/<slug>
→ { id, name, symbol, address, chain_id, max_items, num_items, num_owners,
    creator_address, twitter, website, abi (full contract ABI), ... }
```
Mint stats:
```
GET https://api.scatter.art/v1/collection/<slug>/mint
→ { mints_last_1h, mints_total, volume_total, date_last_mint, ... }
```

## Mint lists (eligibility)
```
GET https://api.scatter.art/v1/collection/<slug>/eligible-invite-lists?minterAddress=<wallet>
→ [{ id, root, name, currency_address, currency_symbol, token_price,
     start_time, end_time, wallet_limit, list_limit }]
```
- Lists can be public (any wallet) or gated. Public list = mintable by anyone.
- `start_time` is ISO UTC — convert to operator TZ before promising timing.
- Wallet limit per list (e.g. 10) — max NFT per wallet via that list.

## Mint transaction (signature from backend — like SeaDrop mintSigned but via API)
```
POST https://api.scatter.art/v1/mint
{ "collectionAddress": "<nft>", "chainId": 4663,
  "minterAddress": "<wallet>",
  "lists": [{ "id": "<list_id>", "quantity": N }] }
→ { "mintTransaction": { "to": ..., "value": "0x...", "data": "0x..." }, "erc20s": [] }
```
- Backend generates the auth tuple + signature server-side. You sign the tx locally.
- `value` = quantity × token_price (wei). Verify it matches before signing.
- Works for **any wallet** — no per-wallet API key needed (public list).

## Executing (FUWA worked example)
1. Read collection → get contract + ABI
2. Check eligible lists → pick public list, note price/limit/start
3. `POST /v1/mint` → mintTransaction
4. Sign locally with wallet PK (ethers, hardcode Robinhood gas 0.15/0.01 gwei)
5. Broadcast → wait receipt → verify `balanceOf`/`tokensOfOwner`

## Scatter chain IDs (from docs)
ETH 1 · Polygon 137 · Monad 143 · Hyperliquid 999 · Abstract 2741 · MegaETH 4326 ·
Mantle 5000 · Base 8453 · Apechain 33139 · Arbitrum 42161 · Ink 57073 ·
Berachain 80094 · Sepolia 11155111

## Pitfalls
- Start time is authoritative — check `eligible-invite-lists` fresh before firing.
- Quantity per tx bounded by wallet_limit; batch up to limit in one POST.
- `erc20s` in response = payment tokens if non-native; ignore for ETH lists.
- Free tier API has no auth but can be rate-limited; add small delay between wallets.
