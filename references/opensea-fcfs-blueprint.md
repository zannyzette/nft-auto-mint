# OpenSea FCFS Bot Blueprint (from Zun's article, 2026-03)

Source: https://x.com/Zun2025/status/2037435538828063196
Author: Zun (defi researcher & security analyst, solo dev antidrain.dev)
Status: UNDOCUMENTED — OpenSea can change chunks/auth/endpoints anytime. Educational breakdown.

## Core Problem
- Public mint: pre-build calldata locally, sign offline, fire at T-0. Easy.
- FCFS allowlist: uses `mintSigned()` which needs a server-generated **salt + signature** from OpenSea's backend. Cannot pre-build calldata. Must fetch from OpenSea at mint time → latency race.

## OpenSea GraphQL Endpoints
| Endpoint | Type | Notes |
|----------|------|-------|
| `api.opensea.io/graphql` | Public | Needs API key, does NOT expose swap/mint queries |
| `gql.opensea.io/graphql` | Internal (frontend) | Cookie auth, no API key, has ALL mint ops |

## Key Queries (found in webpack chunk 008d99104100f8fb.js)
- `MintActionTimelineQuery` — core: calls `swap()` with action MINT → returns `transactionSubmissionData` containing target contract, encoded calldata (salt + signature baked in), ETH value (mint price).
- `MintQuery` — collection metadata, drop identifiers, chain info.
- `dropBySlug` — drop stage timing, start times, stage indexes, labels (for scheduling).
- Response shape imported from module 332238 (separate chunk).

## SIWE Auth Flow (critical exactness)
- Message prefix: `"wants you to sign in with your account:"` — NOT "Ethereum account". One wrong word = silent reject.
- URI field: `encodeURI("https://opensea.io/")` — trailing slash REQUIRED.
- Wallet address passed **lowercase**, as-is, no checksum.
- Verify endpoint receives **parsed fields JSON** (domain, address, statement, uri, version, chainId, nonce, issuedAt) + signature + `chainArch: "EVM"` + `connectorId: "injected"` — NOT the raw signed message.
- Success → access_token + refresh_token in Set-Cookie, ~3.5 day max-age.
- Required header: `x-app-id: os2-web` (identifies as web client). Plus standard browser headers (origin, referer, user-agent, content-type: application/json).

## Latency Physics
- Both gql.opensea.io and Base RPC (mainnet-preconf.base.org) route through Cloudflare IAD (Ashburn, Virginia).
- VPS in IAD region: ~8ms to gql, ~7ms to RPC, ~80ms total swap round-trip.
- From Europe/Asia: 200-400ms = difference between block N and N+1. Server location beats code optimization.

## 5-Step Bot Architecture
### STEP 1 — Auto-scheduling
`dropBySlug` query → stage timing. Poll every 30s for schedule changes (creator can push time). Auto-adjusts.

### STEP 2 — Warm-up (T-5s)
- Pre-fetch nonces for ALL wallets concurrently (cached; zero RPC delay at fire time).
- Chain ID verified once, cached forever.
- HTTP keepalive pings to OpenSea endpoint + RPC (HTTP/2 connections go cold).
- Fault-tolerant: one wallet nonce fail → skip that wallet, not the batch. Degrade gracefully, never abort.

### STEP 3 — Calldata fetch (T-1.5s)
- Tight retry loop hitting `swap()` query. Most drops go live on the exact scheduled second.
- ⭐ **Field aliasing batching**: batch ALL wallets into ONE GraphQL request using aliases (w0, w1, ...). One POST, one round-trip, all calldata at once. Name query short ("B") to save bytes. 50+ wallets = hundreds of ms saved.
- Per-alias errors: `InsufficientFund` → skip, no retry. `DropNotMintingError` → retry whole batch. If ≥1 wallet succeeded, continue.

### STEP 4 — Sign & Send
- Use cached nonce, gas from config (DON'T estimate gas in hot path).
- Sign with C FFI libsecp256k1 (~1.8x faster than k256, ~70µs per signature).
- `eth_sendRawTransaction`.

### STEP 5 — Confirmation
- Base: `base_transactionStatus` RPC method (Unknown/Known/Preconfirmed) — no full receipt wait. Flip to receipt polling when "Known".
- Other chains: standard receipt polling.

## Per-Project Parameters (the only things that change)
1. Contract address
2. Chain (Base / Robinhood / ARC / ETH / BSC)
3. Mint price (ETH / USDG / native)
4. Mint function (mintSigned for allowlist, publicMint for public)
5. Drop ID + schedule (from dropBySlug)

## Build Recommendations
- Language: Rust (native speed, libsecp256k1 FFI) for serious racing; Python MVP to start.
- Server: US East (Ashburn, VA) — REQUIRED for latency parity.
- Maintenance: expect breakage on OpenSea deploys; chunk hashes/endpoints unstable.

## Checklist Before FCFS War
- [ ] VPS in US East (Ashburn)
- [ ] SIWE auth flow tested (exact strings!)
- [ ] swap() query verified working
- [ ] Field-alias batching tested with N wallets
- [ ] Nonce prefetch + keepalive warm-up
- [ ] Gas strategy for race
- [ ] Sweep after mint
