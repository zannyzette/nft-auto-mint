# Scatter.art Launchpad Mint Flow (worked: FUWA, Aug 2026)

Scatter.art (scatter.art) is an artist-first NFT launchpad with a REST API.
Mint works via **mint lists** — the backend generates the auth/signature, so
you can't pre-build calldata, but the flow is simple and automatable.

## Key discovery: API host is NOT blocked

`www.scatter.art` → Vercel Security Checkpoint (429) for server-side curl.
**`api.scatter.art` is NOT blocked** — the whole mint flow works from a server.

## Flow (proven — minted 50 FUWA across 5 wallets)

```
1. GET https://api.scatter.art/v1/collection/{slug}
   → { id, address, chain_id, max_items, num_items, abi, ... }
   → ABI included! Check mint functions: mint(auth tuple, quantity, affiliate, signature)

2. GET https://api.scatter.art/v1/collection/{slug}/eligible-invite-lists?minterAddress={wallet}
   → array of mint lists:
     [{ id, root, address, name, token_price, currency_symbol,
        start_time, end_time, wallet_limit, list_limit, unit_size }]
   → Public list has wallet_limit (e.g. 10). Filter by minterAddress or omit for public only.

3. POST https://api.scatter.art/v1/mint
   body: {
     collectionAddress, chainId, minterAddress,
     lists: [{ id: <list_id>, quantity: <n> }]
   }
   → { mintTransaction: { to, value, data }, erc20s: [] }
   → value = quantity × token_price (already encoded)
   → data = mint() calldata WITH backend signature baked in

4. Sign locally (PK in .env, never in chat) → broadcast to chain
5. Verify: contract balanceOf/tokensOfOwner per wallet
```

## Facts from the worked run (FUWA, Robinhood)

- Chain: Robinhood 4663 · price 0.0002 ETH · wallet_limit 10 · supply 5,555
- `start_time` is authoritative (check API, not website — WIB = UTC+7)
- Mint limit: once wallet hits wallet_limit, further mints REVERT ("execution reverted") — normal, not an error
- 5 wallets × 10 = 50 NFT, cost 0.01 ETH total, gas negligible
- `GET /v1/collection/{slug}/mint` → mint stats (mints_last_1h, volume, owners)

## Scatter supported chains (docs)
ETH 1 · Polygon 137 · Monad 143 · Hyperliquid 999 · Abstract 2741 ·
MegaETH 4326 · Mantle 5000 · Base 8453 · Apechain 33139 · Arbitrum 42161 ·
Ink 57073 · Berachain 80094 · Sepolia 11155111

## Reusable script pattern
`/home/ubuntu/mint-wallets/fuwa-multi-mint.js` — reads wallets.json, mints max
per wallet based on balance, per-wallet error isolation, 2s delay between wallets.
Generalize COLLECTION/LIST_ID per project. Also `fuwa-mint.js` (single wallet).

## Pitfalls
- Duplicate writers: cron auto-mint + manual mint at the same time → second one reverts
  on wallet limit. Check whether the cron already fired before running manually.
- Always re-fetch eligible-invite-lists right before mint (start_time may shift).
- Scatter collection pages are Vercel-blocked server-side; use the API, not the page.
- **API eligibility is STALE — a list can end while the API still serves it (punkx 2026-08):** the free list was returned as eligible (price 0, wallet_limit 2) AND `POST /v1/mint` returned a `mintTransaction` with `value: 0` — but the broadcast REVERTED on-chain (gas ~105k), because the free list had already closed. The API's eligible-invite-lists + /v1/mint do NOT re-check list liveness. When the operator says "free mint semua wallet" and it's late in the mint: test ONE wallet broadcast FIRST and read the receipt before committing the fleet; a revert means the free list is done even though the API still hands out txs. Don't re-send all wallets on a stale list.
- **Verify price via the mint endpoint, not the list field** (Hood Homies 2026-08): `token_price` can come back as a string like `".01"` and look cheap next to a low `volume_total` (which counts WL/free mints). `POST /v1/mint` with `{lists:[{id, quantity:1}]}` returns the authoritative `mintTransaction.value` (e.g. `10000000000000000` = 0.01 ETH ≈ $19/NFT — a very different spend than the volume average implied). Always quote the /v1/mint value to the operator before committing wallets on a paid Scatter public list.
- Public lists can have `wallet_limit` as low as 2 — size the wallet count × qty against the operator's budget, not the collection cap.
