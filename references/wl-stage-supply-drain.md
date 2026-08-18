# WL Stage Before Public = Supply Drain (Knights of Hood, 2026-08-18)

## Kejadian
KOH (ERC721SeaDrop, Robinhood 4663, CA `0x[YOUR_WALLET_ADDRESS]`) —
3 stage: Round Table (Team, max 300), **Robinhood Commanders (WL, gratis, max 3/wallet, 00:00–01:00 UTC)**,
Chivalry (Public, gratis, max 10/wallet, 01:00 UTC).

- 00:43 UTC: supply 2,256/5,000 (WL stage jalan)
- 00:00–01:00 UTC: **WL stage nyedot ~2,744 sisa dalam 1 jam** (ribuan alamat WL × max 3)
- 01:00:05: script detect public aktif (`public_sale`, price 0) → fetch calldata 15 wallet → **SEMUA 422 "Drop is fully minted out"**
- On-chain: totalSupply 5,000/5,000 — public stage kebuka di supply KOSONG

## Pelajaran (HARD)
1. **Public stage di SeaDrop yang punya WL stage gratis sebelumnya = formalitas.** WL yang nyedot supply-nya, bukan public.
2. **Jangan cuma target public.** Sebelum public live, cek eligibility SEMUA stage yang jalan duluan (drops API `active_stage` + `stages[]`). Kalau WL stage gratis + max kecil tapi list gede → itu jalur menang yang sebenernya.
3. **Drops API = ground truth stage.** `GET /drops/{slug}` → `stages[]` ada start/end/price/max_per_wallet per stage. Baca dari awal, bukan pas public doang.
4. **422 "Drop is fully minted out" = verified on-chain.** Jangan grind retry — cek `totalSupply()` vs `maxSupply()` langsung buat konfirmasi (5000/5000 = beres).
5. **Kerugian 0 ETH** — semua 422 sebelum sign/broadcast. Gagal deteksi = gak ada tx = gak ada gas hilang. Race script yang poll-then-fetch aman dari sisi biaya.

## Action next time
- Saat arm race: cek `GET /drops/{slug}` stages SEKALIGUS — kalau ada WL stage gratis sebelum public, tanya operator mau ikut WL juga gak (bisa mint duluan).
- Pre-check eligibility WL per wallet kita (merkle tree / API proof) JAUH sebelum stage live.
