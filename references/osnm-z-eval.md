# OSNM-Z — Evaluasi Alat Cadangan (2026-08-16)

## Status: INSTALLED di ~/tools/osnm-z (build release sukses), TAPI terbatas.

## Apa itu
Rust CLI mint OpenSea-hosted (SeaDrop), single + multi-wallet.
Keunggulan: SIWE auth langsung ke gql.opensea.io → **tidak butuh OPENSEA_API_KEY**.

## Hasil Test Nyata (Robinhood 4663)
- ✅ Build sukses, doctor PASS (RPC + wallet + OpenSea client)
- ❌ **GAGAL di collection multi-stage** — error "requires exactly one active stage"
  (baris 590-595 multi_mint.rs: cuma support collection dengan PERSIS 1 stage aktif)
- ❌ Ini limitasi besar: kebanyakan collection OpenSea punya WL + public = 2+ stage

## Verdict
- **30% berguna** — cuma buat collection 1-stage murni (jarang)
- Toolkit utama (drops API + seadrop-race-v3 + v7) LEBIH UNGGUL: handle multi-stage, terbukti
- **Jangan jadi andalan** — private API unstable (peringatan README mereka sendiri)
- Keep sebagai cadangan darurat aja

## Cara pakai (kalau perlu)
```
cd ~/tools/osnm-z && source ~/.cargo/env
./target/release/opensea-mint doctor
./target/release/opensea-mint mint --collection <slug>
```
Config: .env (RPC/WALLET_KEY) + wallets.json (15 fleet) — PK aman chmod 600.
Regenerate: node config/generate-config.js (baca PK dari fleet, gak di-print).

---

# nft-public-mint (Morsy) — Evaluasi 2026-08-16 — TIDAK PERLU INSTALL

## Apa itu
TypeScript CLI sniper untuk public SeaDrop mints (github.com/morsyxbt/nft-public-mint,
212 stars). "Builds calldata on-chain, no OpenSea token required."

## Hasil bedah kode
- 90% fitur = DUPLIKAT `seadrop-race-v3.js` kita: build calldata dari getPublicDrop,
  feeRecipient dari chain, pre-sign sebelum stage buka, multi-wallet paralel,
  fan-out multi-RPC, support Robinhood 4663.
- Satu-satunya yang agak baru: **connection-warmer** (kirim dummy tx sebelum T-0
  buat panasin handshake RPC). Efeknya MINIM — hemat 100-500ms sekali doang, dan
  kita UDAH dapet efeknya gratis dari recon (baca getPublicDrop = koneksi kepanasin).

## Verdict
- **10% nilai tambah** — duplikat toolkit kita; connection-warmer gak worth ditambah
  (risiko nambah kompleksitas/error lebih besar dari 1x handshake yang dihemat).
- TIDAK di-install. Contek ide connection-warmer TIDAK perlu — recon kita udah
  natural-warm koneksi RPC.

## Pola evaluasi tool komunitas (reusable)
1. Cek repo: stars, created/updated, language, archived.
2. Baca README: klaim vs realita — "supports all chains" ≠ magic.
3. Bedah kode: cari mekanik inti (build calldata, pre-sign, fan-out) —
   bandingkan sama toolkit kita dulu.
4. Verdict jujur: % nilai tambah, duplikat atau bukan, worth install atau gak.
   Kalau duplikat → jangan install, catat aja.
5. Catat ke references/ biar gak re-evaluasi 2x.
