# Proof-of-Luck PoW Mining Mint (MINECAT pattern)

Koleksi yang **gak bisa dibeli** — harus di-mining via keccak256 proof-of-work ("proof-of-luck"). Setiap solusi valid = PASTI jadi NFT (lucky = claim langsung, bust = ticket guaranteed next round). Robinhood chain 4663.

## Contract & state (2026-08-17, live)
- Contract: `0x[YOUR_WALLET_ADDRESS]` (verified)
- Supply 10,000 · mintPriceWei ≈ 0.000106 ETH (~$0.20, dibayar SAAT CLAIM) · diffTicket 20,000,000 · luckyDivisor 6 · ROUND_CAP 50 · roundBlocks 5 (~60s/round, block = L1 12s) · wallet cap 5

## PoW spec
```
hash = keccak256( roundSeed(32) ‖ minerAddress(20) ‖ nonce(8, big-endian) )   // 60 bytes
ticketTarget = 2²⁵⁶ / diffTicket   // hash < ini = solusi valid
luckyTarget  = ticketTarget / luckyDivisor   // < ini = LUCKY (1:6 dari solusi valid)
```
Address ada DI DALAM hash → nonce curian dari mempool gak bisa dipakai wallet lain (hash beda).

## Flow
1. `openRound()` — sekali per round, SIAPA PUN boleh (tx kecil); seed anchor blockhash → gak bisa pre-mine
2. Grinding (gratis) → `submitWork(uint64 nonce)` — **GRATIS** (gak ada fee); lucky → voucher (slot ke-lock), else → ticket (1 ticket/wallet, claimable next round)
3. `claim()` payable — bayar mintPriceWei → mint dari voucher atau ticket matang
4. Slot abis saat lu lucky? Win auto-jadi ticket. Grinding ekstra = lebih banyak peluang (bukan cheat — luck roll = hash solusi lu sendiri)

## Contract selectors (dari live-stats.js situs)
| Function | Selector |
|---|---|
| totalMinted() | 0xa2309ff8 |
| mintPriceWei() | 0xcb2c9722 |
| currentRound() | 0x8a19c8bc |
| diffTicket() | 0x494eb449 |
| luckyDivisor() | 0x13d1dd2f |
| roundMinted(uint256) | 0x7858e822 |
| roundSeed(uint256) | 0x18edfe20 |
| ROUND_CAP() | 0x2a764b47 |
| roundBlocks() | 0x139ca256 |

## Official CLI miner (dari situs — jangan rebuild sendiri)
- Download: `https://minecatnft.com/minecat-miner.zip` → `npm install` → `node minecat-miner.js`
- Flags: `--bench` (ukur hashrate, tanpa key), `--mode cpu|gpu`, `--threads N`, `--once` (stop setelah 1 NFT), `--no-claim`, `--no-open-round`
- Key: env `MINECAT_PRIVATE_KEY` (paling aman) atau config.json chmod 600
- `node verify-preimage.js` — cross-check hash vs `abi.encodePacked(bytes32,address,uint64)` sebelum gas
- Loop otomatis: openRound → grind → submit → claim/ticket → stop di cap 5/wallet

## Pitfalls
- **Halaman arcade (minecatnft.com) = SIMULASI** (ghost miners, saldo palsu, faucet fake, seed random lokal). Yang real: `mint.html` (on-chain page) — angka dari kontrak via `/rpcapi` (RPC publik RH gak bisa dijangkau browser).
- **VPS CPU lemah**: benchmark 2-core VPS = ~63 kH/s/thread → ~2.8 menit/solusi di diff 1:20,000,000. GPU mode butuh Chrome + Vulkan — biasanya gak ada di VPS. Rencanakan ~15 menit/wallet untuk 5/5.
- Mining GRATIS tapi openRound/submitWork/claim tetap kena gas (fraksi sen di RH).
- Event: RoundOpened(round, seed), WorkSubmitted(miner, round, nonce, hash, lucky), Claimed(miner, tokenId, viaTicket).
