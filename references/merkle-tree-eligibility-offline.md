# Offline Merkle-Tree Eligibility Check — Tanpa Connect Wallet (Bunkerhood 2026-08-18)

Project: thebunkerhood.com/mint — "BUNKER: Genesis Artifacts" (CA `0x[YOUR_WALLET_ADDRESS]`, Robinhood 4663, 10,000 supply, 2 fase: GTD allowlist + WL allowlist, FIRST ARTIFACT FREE).

## Cara cek eligible TANPA connect wallet / tanpa situs JS

Banyak claim/mint site Next.js expose **merkle tree JSON statis** di path publik:

```
https://thebunkerhood.com/allowlists/gtd-tree.json   (1.15 MB, root + proofs dict)
https://thebunkerhood.com/allowlists/wl-tree.json    (24.8 MB, 23,576 entries)
```

Format:
```json
{ "root": "0x6e9882...", "proofs": { "0x001461...": ["0x866a9b...", "0x596c91...", ...], ... } }
```

Cek keanggotaan: `addr.lower() in proofs` → masuk list. Ini ground truth yang sama yang dipake contract (merkle root), jadi hasilnya = apa yang bakal dilihat contract pas mint.

Hasil Bunkerhood: 15/15 wallet kita GAK eligible (GTD 1,346 entry, WL 23,576 entry — kita 0). Langsung vonis: skip, jangan gas.

## Recon contract unverified

- Contract BELUM verified di Blockscout → `/api/v2/smart-contracts/{addr}` kasih ABI kosong. TAPI:
  - **ABI & logika mint ada di Next.js page chunk**: `/_next/static/chunks/page-*.js` → grep `merkleRoot`, `mint(` (full ABI string di JS: `{type:'function',name:'mint',inputs:[{name:'stageId',type:'uint8'},...]}`).
  - Site punya **anti-tamper contract identity**: pin expected runtime code hash + owner + name + symbol di JS (`CONTRACT BLOCKED // INVALID RUNTIME CODE HASH` dst). Kalau bytecode mismatch → site block sendiri. Bagus buat scam-check.
- Phase state on-chain: `stage(stageId)` → `{startTime, endTime, price, maxPerWallet, allocation, access, merkleRoot}`; `activeStage()`, `mintedByWalletInStage(stageId, wallet)`. access: 0=disabled, 1=merkle (perlu proof), 2=open.
- Site UI nunjukin "COLLECTION UNAVAILABLE"/"CONTRACT NOT VERIFIED" kalau contract identity check gagal — bukan berarti project mati.

## Pitfall umum

- Tree file bisa gede (WL 24.8MB) — load sekali di Python, jangan baca berulang.
- JANGAN vonis "gak eligible semua" dari 1-2 wallet — cek SEMUA wallet fleet (pernah beda per-wallet: WOJAK cuma 2/15 eligible free).
- Operator rule: kalau operator bilang "udah ga usah bahas X" → drop topik, jangan dilanjutin.
