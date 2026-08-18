# Bunkerhood — WL/GTD Eligibility via Public Merkle Trees + Next.js Page-Chunk Recon (2026-08-18)

## Project
- **BUNKER: Genesis Artifacts** (thebunkerhood.com/mint) — 10,000 supply, Robinhood 4663, symbol BUNKER, CA `0x[YOUR_WALLET_ADDRESS]`.
- 2 fase: **GTD ALLOWLIST** (stage 1) & **WL ALLOWLIST** (stage 2). Harga/fase belum di-set saat recon (CLOSED/DISABLED, START NOT SET).
- Contract **belum verified** di Blockscout (nama/symbol kebaca via `/api/v2/tokens/{CA}`, ABI kosong di smart-contracts endpoint). Frontend PIN bytecode hash: `CONTRACT BLOCKED // INVALID RUNTIME CODE HASH` kalau runtime code gak cocok dengan hash yang diharapkan (`0xe07d58ab...`). Ini anti-tamper bagus.
- Hasil cek: **0/15 wallet operator eligible** → SKIP, jangan buang tx revert.

## Teknik: eligibility check via PUBLIC merkle tree JSON (tanpa connect wallet)
Next.js page chunk (`_next/static/chunks/page-*.js`) berisi logika lengkap:
```
useEffect: Promise.all([uf('/allowlists/gtd-tree.json'), uf('/allowlists/wl-tree.json')])
```
→ **Tree di-publish publik di `/allowlists/gtd-tree.json` & `/allowlists/wl-tree.json`** — cukup download + cek membership:
- Format: `{"root": "0x...", "proofs": {"0xADDR": ["0x...", ...], ...}}`
- Cek: `addr.lower() in proofs` → eligible. GTD 1,346 entry, WL 23,576 entry; wallet fleet 0 ketemu di dua-duanya.
- **Ini cara cek eligibility TERCEPAT dan paling akurat untuk site yang publish tree-nya** — gak perlu connect wallet, gak perlu revert, gak perlu query per-wallet API. Cocok buat "cek eligible gak" sebelum commit effort.

## Recon recipe (Next.js mint site)
1. `curl /mint` → CA + chain langsung di HTML (`0x...` + "ROBINHOOD 4663"). Phase status di teks (GTD/WL/CLOSED).
2. `grep -oE 'src="/_next/static/chunks/[^"]*"'` → semua chunk; **page chunk** (`page-*.js`) = logika mint + ABI.
3. Di page chunk:
   - ABI lengkap contract (name/symbol/MAX_SUPPLY/stage/mint(uint8,uint256,bytes32[])/mintCost/mintedByWalletInStage...) — **sumber ABI alternatif kalau Blockscout belum verified**.
   - `CONTRACT BLOCKED` guard chain: expected name/symbol/owner/MAX_SUPPLY/runtime code hash — baca buat tau verifikasi frontend.
   - Error mapping: `InvalidMerkleProof` → "WALLET IS NOT ELIGIBLE FOR THIS STAGE"; `StageInactive` → "MINT STAGE IS CLOSED".
   - Poll interval 15s (`setInterval(fe, 15000)`), mint flow: `mintCost(stageId, wallet, qty)` → `simulateContract` → write → waitForReceipt.
4. Stage config: `stage(1)` & `stage(2)` return tuple `{startTime, endTime, price, maxPerWallet, allocation, access (0=disabled,1=merkle,2=open), merkleRoot}`. `activeStage()` = current. Baca via RPC buat status fase aktual (UI bisa ngaco).

## Lesson untuk operator
- Project tanpa public lane (cuma GTD/WL) + wallet gak ada di tree = **gak ada jalur mint** → lapor + SKIP. Jangan grind.
- Site yang pin bytecode hash + verifikasi identity di frontend = dev peduli keamanan (good sign), tapi tetep gak nambah eligibility.
- Setelah 2x mint paid yang gak sesuai ekspektasi di hari yang sama (RWAKERS floor vs mintprice, dll), evaluasi floor/opportunity SEBELUM gas — lihat pitfall operator di SKILL.md.

## Files
- Script cek eligibility: `/tmp/check-bunker-elig.py` (baca wallets.json + 2 tree, print per-wallet) — pola langsung reusable: ganti path tree + wallets.
