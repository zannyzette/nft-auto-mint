# Proof-of-Luck Mining Game Mints (MINECAT worked example, live 2026-08-18)

Class: NFT yang **HARUS di-mining** (gak bisa beli langsung) — keccak256 PoW terhadap kontrak, luck menentukan instant-claim vs ticket. Bedanya sama agentic PoW: **gak ada API puzzle**, PoW diverifikasi langsung on-chain di `submitWork`.

## Project facts (MINECAT)
- Contract `0x[YOUR_WALLET_ADDRESS]` (verified, BUKAN proxy, deploy 2026-08-17) — Robinhood 4663
- 10,000 supply · claim price `mintPriceWei()` = 0.0001059 ETH (~$0.20) · cap **5/wallet** · **50 slot/round**
- `diffTicket()` = 20,000,000 · `luckyDivisor()` = 6 → lucky odds 1:6
- Round ~60 detik (`roundBlocks()` = 5 × ~12s L1) — seed baru tiap round, anchor blockhash (gak bisa pre-mine)

## PoW spec (60-byte message — sama di site, CLI miner, dan kontrak)
```
h = keccak256( roundSeed(32) ‖ minerAddress(20) ‖ nonce(8, big-endian) )
ticketTarget = 2²⁵⁶ / diffTicket   → h < ticketTarget = solusi valid
luckyTarget  = ticketTarget / luckyDivisor → h < luckyTarget = LUCKY
```
Address ada DI DALAM hash → nonce gak bisa dicuri orang dari mempool.

## Flow
1. `openRound()` — sekali per round, SIAPA PUN boleh (tx kecil). Kalah balapan = revert "already open" → harmless
2. Grinding nonce — **GRATIS** (gak ada fee)
3. `submitWork(uint64 nonce)` — tx **GRATIS** (value 0). LUCKY → voucher (slot ke-lock); BUST → ticket
4. `claim()` — payable, **value PERSIS mintPriceWei** (re-read fresh sebelum tiap claim — price-flip guard). Mint dari voucher atau ticket mature (round berikutnya)
5. Cap 5/wallet → miner berhenti

## Ticket rules (penting biar gak buang gas)
- **1 ticket per wallet**: BUST + sudah pegang ticket → submitWork revert "already holding ticket" → SKIP bust, terus cari LUCKY
- LUCKY + pegang ticket → **TETAP SAH** (kirim)
- Ticket claimable mulai round berikutnya

## Ekonomi & alat
- **Setiap solusi = PASTI NFT** (lucky langsung / ticket next round) — mining cuma soal waktu. 75 cats (15 wallet × 5) ≈ $15 claim + gas sepeser
- Official CLI miner: `https://minecatnft.com/minecat-miner.zip` (npm install; PK via `MINECAT_PRIVATE_KEY` env — jangan pernah ke chat; `--rpc` Alchemy; `--threads N`; `--once`; `--bench`)
- Fleet supervisor: `/home/ubuntu/mint-wallets/minecat-fleet.js` (2 paralel × 15 wallet, rotate, log per wallet di `minecat-logs/`)
- **Audit miner sebelum dipake**: gak ada approve/setApprovalForAll sama sekali, PK lokal doang, claim value exact → aman dari drain (tanpa approval, kontrak jahat pun gak bisa sentuh aset lain)

## Pitfalls
- **Round rollover**: solusi ditemukan pas seed ganti → submitWork revert "hash above target". Harmless — miner retarget. Makin cepat hashrate, makin kecil risikonya (ini alasan GPU menarik)
- **VPS CPU lemah**: ~63 kH/s/thread (2-core) → ~10 min/solusi di difficulty 1:20M. GPU (RTX 4090 ~1.7 GH/s) = 50,000× lebih cepat; bottleneck jadi round cycle + tx, bukan hashing
- **Headless GPU di VPS biasanya GAGAL** (tanpa GPU/driver Vulkan) — butuh box GPU beneran (Vast.ai/RunPod RTX 4090 ~$0.35-0.65/jam, tanpa KYC)
- Mode split aman: GPU cuma nyari nonce (tanpa PK), VPS lokal yang sign+submit — PK gak pernah keluar dari VPS
- Claim price bisa diubah owner (`setMintPrice`) — selalu baca fresh sebelum tiap claim (miner resmi udah handle ini)
