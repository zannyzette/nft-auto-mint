# Free Mint Race — Lessons (Rentoids, Aug 2026)

## Setup
- Contract: Rentoids `0x[YOUR_WALLET_ADDRESS]` (Robinhood)
- Mint: FREE, 1 slot per 5s window GLOBAL (FCFS), paid lane 0.002 ETH skips queue
- Max 50/wallet. Supply 10,000.

## Result
- **31/50 minted via free lane** (gas ~$2.50 total)
- 19 tersisa: GAGAL diraih — ~1,200+ tx percobaan, 0 hasil di akhir
- Supply sold out pace: ~12/min (1 bot dominan nangkep ~99% slot)

## What worked
1. **Simple loop + patience** — free mint is a numbers game. 31 dapet dari ribuan percobaan
   dengan win rate ~2-3%. Biaya gas nyaris nol (Robinhood murah).
2. **Script structure**: pre-sign tx konstan (mint(1) calldata sama tiap kali), fire raw,
   minimal RPC. `rentoids-race.js` = pre-sign + boundary timing.

## What did NOT work (critical lessons)
1. **Hammer mode (try 2x lebih cepat)** — TIDAK ngaruh. Bukan frekuensi masalahnya.
2. **Pre-sign & fire pas boundary** — optimal secara teknis (1 RPC/coba) tapi tetap kalah.
3. **Lead mode (fire 150-300ms SEBELUM boundary)** — tetap 0. Bot pemenang konsisten
   nangkep tiap window tanpa miss.
4. **ROOT CAUSE: latency fisik.** VPS Asia (~200-400ms ke sequencer) kalah telak dari
   bot US East (~50-80ms). 12 mint/menit = bot utama GAK PERNAH miss = dia deket
   sequencer + timing presisi.
5. **RPC rate-limit**: hammer 2x bikin RPC mulai 403 forbidden setelah ~1,200 tx.

## The physics rule (Zun's law, confirmed)
> "Optimize code all day, physics wins." — Untuk 1-slot-per-window global mint,
> posisi server > kecepatan kode. VPS Asia vs bot US East = kalah permanen di free lane.

## Decision framework untuk free-mint race ke depan
```
1. Cek dulu: mint per-window GLOBAL atau per-wallet?
   - Per-wallet (semua bisa mint) → loop biasa jalan, gas murah
   - Per-window GLOBAL → cek posisi VPS dulu!
2. VPS di US East? → race mode layak dicoba
3. VPS di Asia? → free lane = buang waktu & nonce.
   Opsi: paid lane (kalau murah) ATAU skip
4. Multi-wallet bisa? → baru scale
```

## Scripts (reusable)
- `rentoids-loop.js` — simple loop (retry tiap N detik)
- `rentoids-race.js` — pre-sign + boundary fire + lead mode (`--lead <ms>`)
- Keduanya baca PK dari `.env` (chmod 600), hardcode gas Robinhood (0.15/0.01 gwei)
