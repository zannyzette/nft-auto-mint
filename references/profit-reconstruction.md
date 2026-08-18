# Profit / P&L Reconstruction After NFT Sales

When the operator asks "total profit sell X berapa?" (how much did I make selling),
reconstruct from on-chain data — don't guess, and don't claim precision you can't back.

## Workflow

1. **Current balances** — read ETH + stablecoin (USDG for Robinhood-chain listings) at every
   wallet the project touched. OpenSea/Robinhood NFT sales on this chain settle in **USDG**
   (e.g. FUWA offers were priced in USDG, not ETH). Include the operator's main wallet if
   known (checksum-validate addresses first — a pasted address can fail `getAddress`).

2. **Separate top-ups from proceeds** — ETH inflows to hot wallets are usually the operator
   funding gas, NOT sale proceeds. Use Blockscout `/api/v2/addresses/{addr}/transactions`
   and look for `transfer` txs with large `value` from the operator's known wallet. In the
   FUWA case: ~46 ETH flowed in from `0x116d98F8...` (main wallet) as funding — that would
   have wildly inflated "profit" if counted as sales.

3. **Mint cost is known** — quantity × mint price + gas ≈ modal. State it plainly.

4. **Sold count** — total minted minus remaining (per-wallet `balanceOf` / `tokensOfOwner`).

5. **Honest gaps** — if the exact sale prices can't be reconstructed (OpenSea order API
   405 without a full developer key), say so. Give the floor estimate (sold × lowest offer
   seen) and ask the operator for the marketplace's own sales total (OpenSea → wallet →
   Activity → Sales shows USDG totals). Never invent a profit figure for public claims.

## "Which wallet sold X?" — fleet diagnostic (worked: FUWA #1221, 2026-08)

When the operator says "kejual X, lupa wallet mana" (something sold, forgot which wallet):

1. **Fleet balance scan** — `balanceOf(wallet)` on the NFT contract for ALL fleet wallets (one batched node script). Wallets with 0 = sold everything; wallets with remaining = the candidates.
2. **ownerOf known token IDs** — if the fleet held specific IDs (rarities tracked in session notes), `ownerOf(id)` tells you instantly which ones left the fleet (owner no longer = a fleet address) and which are still held.
3. Confirm the seller = the wallet whose known holding went missing. Optionally pull that wallet's recent txs (Blockscout `/addresses/{addr}/transactions`) for the marketplace/Seaport tx to read the sale price.
4. Note the unit ambiguity: "0.1" could be ETH (~$191) or USDG (~$0.10) — Robinhood listings settle in USDG; ask/verify before celebrating.

## Operator pattern (sell decisions)

- Operator controls **when/what to sell** ("gw yang atur harga, lu tinggal jalanin kalo gw
  perintahin take offer"). Agent executes on explicit command; never auto-sells NFTs or
  accepts offers without an order.
- Offer threshold flow: operator states a floor (e.g. "accept yang ≥ $1.20"), agent checks
  what meets it, confirms before accepting (accepting = irreversible).
- For "larping di X" (flex posts): only quote numbers you verified; for unverifiable
  profit, give the safe claims (minted N, sold M, hold K) and mark profit as approximate.
