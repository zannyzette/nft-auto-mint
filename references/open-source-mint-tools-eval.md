# Evaluasi Open-Source Mint Tools (2026-08) — OSNM-Z & nft-public-mint

Dua tool GitHub yang dievaluasi operator. **Keduanya GAK di-install sebagai pengganti** — toolkit kita tetap utama. Catat biar gak riset ulang.

## OSNM-Z (github.com/zunmax/osnm-z) — Rust CLI, 125★
- **Kelebihan:** mint OpenSea-hosted via SIWE auth → TANPA OPENSEA_API_KEY; multi-wallet (10 self / 25 sponsored EIP-7702).
- **LIMITASI FATAL (test nyata):** cuma support collection dengan PERSIS 1 stage aktif. Error `NoUniqueActiveStage` (multi_mint.rs:590-595) — kebanyakan collection OpenSea punya WL+public = 2+ stage → GAGAL di dirty-degen & cyclops.
- **Status:** installed di `~/tools/osnm-z` (build release OK, doctor PASS Robinhood 4663), TAPI 30% berguna — cadangan darurat doang.
- Config: `.env` (RPC/WALLET_KEY) + `wallets.json` (fleet). Regenerate: `node config/generate-config.js` (PK gak di-print).
- **JANGAN sentuh sponsored/EIP-7702** — kontrak unaudited, Robinhood belum tentu support.

## nft-public-mint (github.com/morsyxbt/nft-public-mint) — TypeScript, 212★
- Klaim: "CLI sniper public SeaDrop, builds calldata on-chain, no OpenSea token".
- **HASIL BEDAH: 90% DUPLIKAT `seadrop-race-v3.js` kita** — pre-sign, build calldata dari getPublicDrop, feeRecipient dari chain, fan-out multi-RPC, multi-wallet paralel — semua kita udah punya & TERBUKTI (Childhood 50/50).
- Satu-satunya beda: `connection-warmer.ts` (panasin koneksi RPC sebelum T-0) — **efek minor, gak perlu ditiru**; recon kita udah otomatis "menghangatkan" koneksi.
- **Verdict: gak perlu install.**

## Pola evaluasi tool mint pihak ketiga
1. Jangan percaya klaim README — bedah source: cek chain support (4663), ABI, limitasi stage.
2. Bandingkan fitur satu-per-satu dengan toolkit kita — biasanya 80-90% duplikat.
3. Yang worth cuma fitur BARU yang kita gak punya (mis. SIWE auth tanpa API key) — itupun cek dulu limitasinya.
4. Test di Robinhood beneran (doctor/calldata) sebelum putusin.
