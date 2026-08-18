# Stock-Token Mints (WallStreetBrokers / $SPCX) — check the BUY ROUTE first

A mint class where the payment token is a **tokenized real-world stock** on Robinhood Chain (e.g. `$SPCX` = "Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token"). The NFT is usually gamified (hire/clock-in/earn) with tier pricing.

## The blocker (worked: WallStreetBrokers 2026-08)
We lost the window because we couldn't acquire the payment token in time. **Rule: before planning/committing to a stock-token mint, confirm the token's BUY ROUTE — if you can't buy the token, the mint is impossible.**

## Mechanics (WallStreetBrokers worked example)
- NFT `WorkerNFT` `0x[YOUR_WALLET_ADDRESS]` — `mintPrice()` (base), `maxPerWallet()`, `saleActive()`, `quoteMintSPCX(qty)` (the REAL per-NFT cost in SPCX).
- Token `$SPCX` `0x[YOUR_WALLET_ADDRESS]` (18 dec, ~15.48M supply, tokenized SpaceX share).
- Flow: `approve(SPCX → NFT)` then `mint(qty)` — burns SPCX.
- **Tier pricing**: cost rises with supply progress (e.g. $0.15 → $0.35 → $0.60 → $1.00 per NFT). `quoteMintSPCX(1) × oracle_price = USD cost` — at 72% minted it was the top tier ($1.00). Read `spcxUsdOracle()` → `spcxUsdPrice18()` for the live token price.
- Sim `mint(1)` reverts with custom error carrying (requiredSPCX, sent) — the revert DATA tells you the exact required amount (0.001 base, but the real cost is quoteMintSPCX).

## Buying the token — the hard part
- Liquidity: **Uniswap V3 pools SPCX/USDG** (not ETH!). USDG = "Global Dollar" stablecoin `0x[YOUR_WALLET_ADDRESS]` (6 dec). Pools: `0xEb07d958...` (fee 3000), `0xc6128433...` (fee 500).
- To buy SPCX you need **USDG first** (or an ETH→USDG→SPCX multi-hop). Canonical Uniswap V3 SwapRouter addresses are NOT deployed on Robinhood; the router must be discovered per-chain (check pool swap txs for the caller, or the site's own swap config). `0x[YOUR_WALLET_ADDRESS]` on Robinhood is **Multicall3**, NOT the 1inch router.
- The project site's "Buy $SPCX" button may be a placeholder (`href="#"`) — don't rely on it.
- Likely intended path: buy the stock token via the **Robinhood app/wallet** directly (it's a Robinhood stock token), not a DEX.

## Checklist before committing to a stock-token mint
- [ ] Token contract + decimals identified (balanceOf, oracle)
- [ ] REAL per-NFT cost = `quoteMintSPCX(1)` (not `mintPrice()`), times qty
- [ ] Buy route CONFIRMED (which DEX + which pairs, or app purchase) — before the drop closes
- [ ] Wallet funded in the RIGHT token (or USDG for the hop), not just ETH
