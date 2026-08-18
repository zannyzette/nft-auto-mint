# Detecting OpenSea-Managed / Drops-API Mints from Calldata (Cyclops Eyrix, 2026-08-15)

Class: collection looks like a plain SeaDrop public mint, but minting actually requires
a signature from OpenSea's backend (drops-API / mintSigned) — NOT direct `mintPublic`.
Recognizing this fast saves the "why does my sim revert?" rabbit hole.

## Worked example: Cyclops Eyrix (cyclopseyrixnft, Robinhood 4663)

- NFT contract `0x[YOUR_WALLET_ADDRESS]` — SeaDrop clone (txs go to
  `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5`), `getPublicDrop` reads fine:
  `[0.0001 ETH, start, end, maxLimitPerWallet=10, maxLimitPerMint=1000, feesOnMint=true]`.
- `getMintStats(wallet)` on the NFT contract works (1-arg variant); the SeaDrop 2-arg
  variant (`getMintStats(nft, minter)`) ERR'd — use the NFT contract's own.

## The tell: real mint tx is NOT plain mintPublic

Real successful tx (blok 37206391):
```
to      = 0x[YOUR_WALLET_ADDRESS]   ← wrapper/minter contract, NOT SeaDrop
selector= 0x765e827f  (wrapper; body contains execute(0x00005EA0, 0x5af3107a4000=0.0001, calldata))
inner   = 0x161ac21f  mintPublic(0x6656d732, 0x0000a26b...OpenSea-fee-collector, minter, 1)
extra   = 0x3d958fe2  (embedded signature — server-issued)
known   = 0xb61d27f6  execute(address,uint256,bytes)
```
Plain `mintPublic` staticCall against SeaDrop → `could not decode result data` /
`0xf477d26f` unknown error, for EVERY wallet (even unminted ones, correct feeCollector
`0x0000a26b00c1F0DF003000390027140000fAa719`, minterIfNotPayer = own address or zero).
Error selector `0xedc01273` = MintQuantityExceedsMaxMintedPerWallet (wallet already at cap).

## Diagnostic sequence (fast, all Alchemy RPC)

1. `getPublicDrop(nft)` on SeaDrop → price/window/cap (looks mintable).
2. SIM `mintPublic(nft, 0x0000a26b..., ownAddr, 1)` value=price → if "could not decode
   result data" / unknown custom error on a fresh wallet → suspect non-public path.
3. Scan recent Transfer logs of the NFT; read the mint tx `to` + `data`.
   - `tx.to` = wrapper contract + nested `execute()` + embedded signature → **drops-API / mintSigned**.
   - `tx.to` = SeaDrop + plain 4-arg mintPublic → bot-able directly.
4. Drops-API requires `OPENSEA_API_KEY` (`POST /api/v2/drops/{slug}/mint` → 200 calldata,
   401/403 without key). No key → mint manually in the UI or wait for key approval.

## Verdict pattern

SeaDrop-looking + sim reverts with decode errors + real txs go through a wrapper with
signature = OpenSea-managed mint. Bot-able ONLY with an API key. Cost/benefit: at $0.19/NFT
manual UI minting is fine; don't burn session time reverse-engineering the signature.
