# Robinhood Brokers — Multi-Contract Token-Burn Mint (worked 2026-08)

A mint class where you **buy a token from the project's own exchange contract, then burn it** to mint the NFT. Not SeaDrop, not plain ERC721 mint — 4 contracts working together. Verified live.

## Architecture (robinhoodbrokers.xyz, Robinhood chain)

| Contract | Role |
|----------|------|
| **Ward** (`0x[YOUR_WALLET_ADDRESS]`) | NFT "Robinhood Brokers", 7,000 supply, `WALLET_CAP`=10. Views: `price()`, `minted()`, `band()`, `leftInBand()`, `bandPrice(i)`, `raisedBy(addr)`, `raiseTo(addr,qty)` (called by crypt) |
| **Scrip** (`0x[YOUR_WALLET_ADDRESS]`) | ERC20 `$BROKER` (10B supply, 18 dec). The burn currency. |
| **Window** (`0x[YOUR_WALLET_ADDRESS]`) | Built-in exchange: `buy(minOut)` payable ETH→$BROKER. Views: `quote(ethWei)->brokerRaw`, `ethFor(brokerRaw)->ethWei`, `shelf()`, `minSpend()`. Price from on-chain ETH/USD oracle (`ethUsd()` 8 dec, e.g. 191180000000 = $1,911.80). |
| **Undertaker** (`0x[YOUR_WALLET_ADDRESS]`) | Crypt: `raise(qty)` = the MINT. Burns $BROKER from msg.sender, mints NFT via Ward. Also `restore`/`resurrect`/`sacrifice`, `open()`, `capacityOf(addr)`, `pledge` (holding mechanics). |

## Mint flow (3 txs per wallet)

```
1. Window.buy(minOut)  — value = ethFor(need) × 1.003 (0.3% slippage), minOut = need × 0.99
2. Scrip.approve(Undertaker, MAX)  — spender is the CRYPT, not the NFT contract
3. Undertaker.raise(qty)  — burns qty × price() $BROKER
```

- **Banded dynamic pricing**: `band` = price tier, 1,000 slots per band. Verified: band 0 = 35,000, band 1 = 75,000, band 2 = 120,000 $BROKER/ea. Price read via `Ward.price()`. Band flips happen FAST on a hot drop (0 → 2 in < 30 min, ~130 raises/min) — **re-read `price()` per wallet, never cache it**.
- **Balance-aware sizing**: `qty = min(capLeft, floor((ethBal - gasReserve) / (ethPerBroker × 1.003)))`. If band flips mid-run, qty = floor(brokerBal / freshPrice) — leftover $BROKER stays in wallet (usable for resurrection).
- Raise gas is chunky: qty=10 ≈ **1.54M gas** (~$0.50 at 0.15 gwei ceiling). Buy ≈ 110k, approve ≈ 46k.
- `raisedBy(addr)` on Ward = authoritative per-wallet count (final verify). `capacityOf` on Undertaker returned 0 even with cap room — don't trust it, use `WALLET_CAP - raisedBy`.
- **Simulation pitfall**: staticCall of `raise(qty)` with 0 balance reverts with `0xfb8f41b2` custom error (insufficient $BROKER) — expected. Sim AFTER buy+approve, before raise.
- Site UI hint: "You don't mint a Broker, you **raise** one — burn $BROKER". Casefile contract = pure SVG/metadata generation (Case # from block hash at seal, not token ID).
- X handle from site: @RHBrokersNFT. `ethUsd` oracle on Window = live ETH/USD — useful free price feed for cost math on Robinhood.

## Skill scripts
- `/home/ubuntu/mint-wallets/brokers-mint.js` — full 3-step flow, dual-RPC, retry, chainId 4663, PK never printed.
- Discovery path that worked: site JS chunks (Next.js) → grep `0x[0-9a-fA-F]{40}` + function-name fragments (`name:"buy"`, `name:"raise"`) → Blockscout names each contract (Window/Undertaker/Scrip/Ward/Casefile) → RPC probes to map roles (name/symbol/totalSupply/decimals) → crypt() view on NFT links the crypt address.

## Pitfalls from WallStreetBrokers (WorkerNFT, 2026-08)

- **ALWAYS use the contract's quote function for the real cost — base price views lie.** WorkerNFT: `mintPrice()` = 0.001 SPCX, but the ACTUAL cost `quoteMintSPCX(1)` = 0.0069495 SPCX (tier multiplier × USD oracle conversion). On-chain mint payments matched the quote (0.0695 SPCX for 10), not the base view. Same class as banded pricing: read `quote*`/`priceOf`/`ethFor`, never the static price setter.
- **Tier-based dynamic pricing** (WallStreetBrokers): `spcxUsdTier1..4` ($0.15/$0.35/$0.60/$1.00) + `tier*Price` SPCX amounts; tier rises with mint progress (we hit tier 4 at 72% supply). Check current tier via the quote, and warn the operator when they're in the top tier — $1/NFT vs the $0.15 opening tier changes the "worth it" call.
- **0x[YOUR_WALLET_ADDRESS] = Multicall3 on Robinhood, NOT the 1inch router.** On other chains that address is the 1inch v6 router; on Robinhood it's the canonical Multicall3. Verify router identity by reading `name()`/`WETH9()`/`factory()` before building a swap against it.
- **Buy-route blocker pattern:** token pools on Uniswap V3 vs USDG (stablecoin) mean ETH→USDG→SPCX multi-hop with a router you may not be able to locate (canonical Uniswap routers don't exist on Robinhood; pool tx lists show no recent swaps to identify the router; site "Buy" buttons are often `href="#"` placeholders). When this happens, the intended acquisition path is usually the NATIVE platform — Robinhood stock tokens (SPCX = tokenized SpaceX) are bought in the Robinhood app, not a DEX. Report the blocker + ask the operator how the community buys the token instead of burning hours on router archaeology.

## Variant: USD-tier pricing paid in a stock token (WallStreetBrokers, 2026-08-13)

- Mint = "Hire", pays **$SPCX** (tokenized SpaceX stock, `0x4a0E65A3...`, ~$144) via `approve SPCX → NFT.mint(qty)`. 1inch router `0xcA11bde...` in site chunks = buy path.
- **TIER-BASED USD PRICING** (not fixed): contract views `spcxUsdTier1-4` ($0.15/$0.35/$0.60/$1.00) + `tier1-3Price` in SPCX. Current tier depends on mint progress — at 72%+ sold you're in **tier 4 ($1.00/NFT)**.
- **`mintPrice()` is a LIE for cost estimation** — it returned 0.001 SPCX while the real cost was `quoteMintSPCX(qty)` = 0.0069495 SPCX/NFT (≈ $1.00 via oracle). **Always read `quoteMintSPCX(1)` (or the equivalent quote fn) for the actual per-NFT cost**, and cross-check with real on-chain mint payments (token transfers to the NFT contract).
- Oracle: `spcxUsdOracle()` view → `SpcxUsdOracle.spcxUsdPrice18()` = SPCX/USD (18 dec). Cost check: quoteSPCX × oraclePrice = USD tier price.
- Site "Buy $SPCX" button was a placeholder (`href="#"`) — locate the real pool yourself (standard Uniswap V2 create2 pair didn't exist on Robinhood for SPCX/WETH; oracle is unverified with hardcoded pool). Don't promise a buy route until the pool is found.

## ⚠️ Fan-made mints using an EXISTING third-party token (Cash Delivery Birds, 2026-08)

Before promising execution on any token-burn mint, **verify where the payment token comes from**:

- Check every wallet's ERC-20 balance of the payment token FIRST (`balanceOf`). 0 balance = blocked unless there's a built-in exchange.
- The site's "buy token" link may just point to the token team's X, not a DEX. Grep the site JS/HTML for an exchange contract (Brokers had `Window.buy`; CDB had none) — if there's no on-ramp and no DEX pair found (Blockscout holders/transfers, 1inch API), execution is NOT possible without the operator sourcing tokens.
- Check the FAQ for affiliation: fan-made mints often state "**not affiliated with / not endorsed by the token team**" (Cash Delivery Birds FAQ said exactly this) and reward/staking promises are conditional ("pool funded by creator after mint ends", "owning a bird does not guarantee a fixed value"). Flag this honestly before the operator spends tokens.
- Mint signature itself is simple: `token.approve(nft, total)` then `nft.mint(qty)` (site ABI: `mint(uint256)`, fixed price `PRICE_PER_BIRD` in token units). Sim `mint(1)` reverts with the same `0xfb8f41b2` insufficient-balance custom error as Brokers — expected until funded.

## Variant: fan mint on an EXISTING token (Cash Delivery Birds, 2026-08)

`cashdeliverybirds.xyz` — same burn-to-mint shape, DIFFERENT acquisition problem:

- NFT `0xCcA3F885...`: `mint(uint256 qty)` burns **10,000 $CASHBIRD per bird** (fixed price, max 20/wallet, 4,950 supply). Flow = `approve(token → NFT)` then `NFT.mint(qty)` — spender is the NFT contract itself, no separate crypt.
- Token `0x91554e79...` ("Cash Delivery Bird", 1B supply) is a PRE-EXISTING token; the NFT project's own FAQ says **"not affiliated with the token team"** — a fan-made mint that prices itself in someone else's token.
- **Blocker we hit: no acquisition path.** The site has NO built-in exchange (unlike Brokers' `Window`); the "token ↗" link just goes to the project X account; no DEX pool surfaced (1inch v5 API dead, Blockscout flaky). Wallet had 0 token → mint unexecutable.
- **Lesson: for token-burn mints, FIRST answer "where does the operator get the payment token?" before promising execution** — exchange contract? DEX pair (check token transfer history for a pool contract)? airdrop? If none found, ask the operator (they may hold the token / know the community route). Never assume a buy path exists because a similar project had one.
- Flag fan-mint economics honestly: payment token ≠ project value; "not affiliated" + reward-pool-not-yet-funded = the mint is a community tax on token holders unless the operator explicitly wants the NFT.
