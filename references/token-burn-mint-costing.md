# Token-Burn Mint Costing (pay with 2 tokens + fee)

Mint class where cost = burn token A + burn token B + ETH protocol fee, with a % burned permanently. Worked example: **Stonkbankers** (stonkbankers.fun/mint, Robinhood, 2026-08-15): 1 Stonkbanker = 420 $PONS + 42,000 $STONKBANKERS + 0.001 ETH protocol fee; 50% of each token destroyed in-call; 4,444 supply; 4/wallet; "1 Stonkbroker = 420 $PONS + 42,000 $Stonkbrokers" reward hook.

## Cost math (quote in $ BEFORE anything)
- Get token prices via DexScreener search API: `https://api.dexscreener.com/latest/dex/search?q=<SYMBOL>` → `pairs[].baseToken.address` + `priceUsd` + `liquidity.usd`.
- cost = qtyA × priceA + qtyB × priceB + feeEth × ETHprice.
- Example: 420 PONS @ $0.039 = $16.38 + 42,000 STONKBANKERS @ $0.000118 = $4.97 + 0.001 ETH = $1.91 → **~$23.26/NFT**; ×4/wallet = ~$93/wallet; ×10 wallets ≈ $930.
- **50% burned = real cost is higher than the quote** (half the tokens you bought are destroyed). State this.
- **Must BUY the tokens first** — check `balanceOf` per wallet; a fleet with 0 token balance can't mint at all (need a buy route: Uniswap V3 / the project's own exchange).

## Liquidity warning
Check `liquidity.usd` on the burn tokens. STONKBANKERS had only ~$27k liq — buying 42,000 per mint across 10 wallets causes heavy slippage. If liq is thin, quote slippage or say the play is too expensive.

## Recon notes
- Burn mechanics are usually spelled out on the mint page ("burned into existence", "Half of every token you pay is destroyed").
- Contract views: `mintPrice()`, `paused()`, `totalSupply()`, per-wallet limits — probe before promising.
- Price oracle can be on-chain (`currentPriceFor(wallet)` per-wallet pricing exists in some variants).

## Family
Same class as Robinhood Brokers (`token-burn-multi-contract-mint.md`) but 2-token + fee, no banded oracle exchange. Check that reference for the buy→approve→burn pipeline.
