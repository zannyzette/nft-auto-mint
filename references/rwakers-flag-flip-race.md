# RWAKERS — Flag-Flip Poll Race (ERC-8004, Robinhood) — VERIFIED 15/15 (2026-08-18)

Project: **RWAKERS** (rwakers.xyz) — 5,000 ERC-8004 agent-registry NFTs on Robinhood Chain (4663).
Art = 64×64 plate **computed onchain** from tokenId (SVG, no IPFS); rarity = residue of work (plate redrawn from agent record), NOT rolled at mint.
Novel mechanics: 10 mandates/archetypes (MERCURY arbitrage … CHARON exit), 4 states (DORMANT→STIRRING→WOKEN→CANCELLED), reputation weight = sqrt(executions) × counterparties^0.25 × (1−maxDrawdown) × uptime. Docs/mechanics/endpoints: `curl https://rwakers.xyz/llms.txt`.

## Contracts (all VERIFIED on Blockscout `robinhoodchain.blockscout.com`)
| Role | Address |
|---|---|
| Certificate (ERC-721: mint, tiers, royalties) | `0x[YOUR_WALLET_ADDRESS]` |
| Metadata (tokenURI, onchain) | `0x[YOUR_WALLET_ADDRESS]` |
| Plate renderer (SVG) | `0x[YOUR_WALLET_ADDRESS]` |
| Identity registry (ERC-8004) | not deployed at mint time |

## Mint mechanics (on-chain reads)
- `mintOpen()` bool — **opens on a transaction (`setMintOpen(true)`), NOT a countdown**. No schedule to pre-position to; must poll the flag.
- `mint(uint256 qty)` payable — public tier; value = `price() × qty`.
- `mint(uint256 qty, bytes32[] proof)` payable — merkle tiers (list/free); free = value 0.
- `price()` = 0.0005 ETH public · `discountPrice()` = 0.00025 list · free list = 0.
- `MAX_PER_TX` 5, `MAX_PER_WALLET` 10, `freeCap` 1, `discountCap` 10, `MAX_SUPPLY` 5000.
- State check: `mintOpen`, `price`, `discountPrice`, `totalSupply`, `mintedBy(wallet)`, `balanceOf(wallet)`, `listRoot`, `freeRoot`.

## Tier / proof API (server-side merkle)
`GET https://rwakers.xyz/api/proof/<wallet-lowercase>` → `{tier: "free"|"list"|"public", listed, price, proofs, proof}`
- **`proofs` = NESTED** (array containing 1 array of 9 items); **`proof` = FLAT array siap-pakai**. Use `d.proof || d.proofs.flat()` — passing `proofs` straight into `encodeFunctionData` throws `invalid BytesLike value`.
- Tier check per wallet: w1 = free (WL), w2-15 = public. `GET /api/collection` → `{supply, price, listPrice, listSize, freeSize, minted, soldOut, archetypes}`.

## Race script pattern (VERIFIED 15/15, 31 NFT: 1 free + 30 paid)
Template: `templates/flag-flip-poll-race.js`. Flow:
1. Pre-sign ALL txs up front (free tier: fetch proof, encode `mint(uint256,bytes32[])`, value 0; public: `mint(uint256)`, value = price×qty). Pre-signing = race won before the flag flips.
2. Poll `mintOpen()` every ~1.5s via Alchemy.
3. On flip: **price-flip guard** (re-read `price()` fresh; stop if ≠ expected) → `Promise.all` parallel broadcast (nonce per wallet).
4. Verify receipts + decode `Transfer(from=0x0)` events → tokenIds.

Result: 15/15 SUCCESS; supply was 120/5000 by the time we verified (~26% ours) — bots were active, but pre-signed parallel fire landed everything.

## Pitfalls hit this session
- **ethers v6 overloaded fn**: ABI with both `mint(uint256)` and `mint(uint256,bytes32[])` → `encodeFunctionData('mint', …)` throws `ambiguous function description`. Always use full signature strings.
- **wallets.json format**: `{leader, wallets: {"1": {address, label, chain, env, status}, …}}` — dict keyed by numeric string, NOT a list. Parse: sort keys numerically, read `.address`. Wrong assumption → `unsupported addressable value` / "0 wallet terdaftar".
- **PK locations**: `/home/ubuntu/mint-wallets/wallet-<idx>/.env` → `PRIVATE_KEY=0x…` (chmod 600, never print).
- **Bytecode security scan**: naive `0xff` grep in runtime bytecode = **232 false SELFDESTRUCT hits** (they're PUSH32 operands: embedded addresses/roots). Use a push-aware disassembler (skip 1..32 bytes after every PUSH1-PUSH32) before judging. RWAKERS result: clean (only EXTCODEHASH — royalty/metadata checks). No proxy, no delegatecall.
- **Gas**: RH single sequencer — arrival-time FCFS, not gas auction. gasLimit 400k, maxFee 0.5 gwei (refunded ceiling). Cost for 31 NFT ≈ 0.015 ETH mint + ~0.0001 gas ≈ $28.4.

## Costs & distribution used
30 paid NFTs spread over 14 wallets (w2×3, w8×3, rest ×2) = 14 parallel public txs + w1×1 free. All wallets 2-15 had sufficient balance (thinest w4 0.0021 ETH still covered 2×0.0005+gas).
