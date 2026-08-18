# Proof-of-Luck / PoW Mining-Game Mints (MINECAT pattern)

Collection yang TIDAK bisa dibeli — harus di-mining via keccak256 proof-of-work langsung ke kontrak. Round-based + ticket mechanic. Setiap solusi valid = PASTI jadi NFT (lucky → claim instan; bust → ticket → claim round berikutnya). Bedanya sama agentic-PoW API (Neon/Alien): TIDAK ada API puzzle — grinding hash sendiri, submit langsung ke kontrak.

## Live example: MINECAT (Robinhood 4663)
- Contract: `0x[YOUR_WALLET_ADDRESS]` (verified, bukan proxy)
- Supply 10,000 · mintPriceWei ~0.000106 ETH ($0.20) · cap 5/wallet · 50 slot/round · round ~60s (roundBlocks=5)
- Site: minecatnft.com — **proyek menyediakan CLI miner sendiri** (`minecat-miner.zip`) + docs + skill file (404 di path web tapi zip berisi README lengkap). Selalu cek `miner.zip`/README/docs — itu spek resmi.

## PoW protocol
```
hash = keccak256( roundSeed(32) ‖ minerAddress(20) ‖ nonce(8, big-endian) )   // 60 bytes
ticketTarget = 2²⁵⁶ / diffTicket     // hash < ticketTarget = solusi valid
luckyTarget  = ticketTarget / luckyDivisor  // di bawah ini = LUCKY
```
- diffTicket live = 20,000,000; luckyDivisor = 6 → odds lucky 1:6 per solusi valid
- Round: `openRound()` (SIAPA PUN, sekali/round, seed anchor ke blockhash → gak bisa pre-mine) → grind → `submitWork(uint64 nonce)` [GRATIS] → lucky = voucher (slot ke-lock) / bust = ticket → `claim()` payable = mintPriceWei PERSIS (msg.value == mintPriceWei, revert kalau beda)
- Ticket: cuma 1 per wallet; bust kedua pas masih pegang ticket = revert "already holding ticket" (lucky tetap sah)

## Contract selectors (dari live-stats.js proyek)
`totalMinted 0xa2309ff8 · mintPriceWei 0xcb2c9722 · currentRound 0x8a19c8bc · diffTicket 0x494eb449 · luckyDivisor 0x13d1dd2f · roundMinted(uint256) 0x7858e822 · roundSeed(uint256) 0x18edfe20 · ROUND_CAP 0x2a764b47 · roundBlocks 0x139ca256`
Events: `RoundOpened(round, seed) · WorkSubmitted(miner, round, nonce, hash, lucky) · Claimed(miner, tokenId, viaTicket)`

## CLI miner (official) — cara pakai
```
node minecat-miner.js --bench            # ukur hashrate, gak butuh key
MINECAT_PRIVATE_KEY=0x.. node minecat-miner.js --threads N --rpc <alchemy> 
--once (1 NFT lalu stop) · --no-claim · --no-open-round · --mode gpu (butuh Chrome 113+ WebGPU)
```
Miner otomatis: openRound kalau seed kosong, claim voucher/ticket duluan, skip bust pas pegang ticket, retarget pas round ganti, backoff soft-fail, **re-read mintPriceWei sebelum SETIAP claim** (price-flip guard built-in).
`verify-preimage.js` — cross-check konstruksi hash vs ethers SEBELUM gas.

## Pitfalls
- **`"hash above target"` on submitWork = round rollover mid-submit** (miner lambat) — HARMLESS, miner retarget & lanjut. Solusi harus ke-submit DALAM round yang sama (~60s).
- **VPS CPU lemah**: ~34 kH/s/thread (2-core) → ~10 menit/solusi di 1:20M. GPU 4090 WebGPU ~1.7 GH/s → <1 detik. Selalu `--bench` dulu, hitung waktu per wallet, lapor angka polos ke operator.
- **Fleet supervision**: throughput total = cores-bound (2 core = 2 proses × 1 thread, rotate wallet, log per wallet, notify pas kelar). Paralelisme gak nambah throughput total.
- Round seed yang sama dipakai semua miner; nonce bebas — `startNonce` besar (Date.now()*1e6) hindari tabrakan antar run.

## Security audit SEBELUM jalanin miner eksternal (pola baku)
1. Baca source miner: **ZERO approve/setApprovalForAll** (kalau ada = drain vector, SKIP)
2. Semua tx payable → kontrak NFT verified, value = mintPriceWei exact
3. PK cuma dipake `new ethers.Wallet(pk)` lokal; gak ada URL exfil
4. Kontrak verified + bukan proxy/upgradeable; umur <24h = yellow flag tapi verified source = mitigasi kuat
5. Hot wallet kecil aja (cap exposure); **max loss per tx = mintPriceWei**
6. Test 1 wallet `--once` dulu sebelum fleet penuh

## GPU rental (kalau CPU kekecilan)
- Mode GPU resmi butuh **WebGPU/Vulkan** (Chrome headless + WGSL kernel) — BUKAN CUDA biasa. Verifikasi driver di box sewaan; di VPS tanpa GPU/Vulkan → CPU.
- **Split-mode alternatif (lebih aman):** box GPU cuma hitung nonce (seed+addr+targets), VPS lokal yang sign + submit → PK GAK PERNAH keluar dari VPS.
- Vast.ai **tanpa KYC** (email + kartu ATAU crypto USDC — kartu ID sering ditolak, USDC bypass); alternatif: RunPod, TensorDock, Google Colab (T4 gratis, butuh CUDA keccak cracker custom — lihat `gpu-pow-farm-setup.md`).
- Sewa 1x RTX 4090 ~$0.35-0.6/jam; 1-2 jam cukup buat full fleet di 1.7 GH/s.
