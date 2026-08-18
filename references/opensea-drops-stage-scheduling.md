# OpenSea Drops API — Multi-Stage Scheduling & Pre-Position Race (KOH 2026-08-18)

Project: Knights of Hood (`knights-of-hood`, CA `0x[YOUR_WALLET_ADDRESS]`, ERC721SeaDrop, Robinhood 4663, drop_type `seadrop_v1_erc721`, verified).

## Kunci: `GET /api/v2/drops/{slug}` ngasih SEMUA stage (masa depan + aktif)

Response punya: `is_minting`, `active_stage` (yang lagi jalan) dan **`stages[]`** (daftar lengkap termasuk yang belum mulai):

```json
{
  "is_minting": true,
  "active_stage": { "stage_type":"signed_presale", "label":"... (Whitelist)", "price":"0", "start_time":"2026-08-18T00:00:00Z", "end_time":"2026-08-18T01:00:00Z", "max_per_wallet":"3" },
  "stages": [
    { "stage_type":"public_sale", "label":"Chivalry (Public)", "price":"0", "start_time":"2026-08-18T01:00:00Z", "end_time":"2026-08-20T01:00:00Z", "max_per_wallet":"10" },
    { "stage_type":"signed_presale", "label":"Round Table (Team)", "price":"0", "max_per_wallet":"300" }
  ]
}
```

**Ini sumber kebenaran buat pre-position race:** harga public (0 = FREE), max_per_wallet, dan start_time SEMUA kebaca sebelum stage aktif. Gak perlu nebak.

## Pola race: poll sampai stage target aktif → fire

```js
// 1. TARGET_START = new Date(stage.start_time).getTime() dari stages[] public_sale
// 2. Loop tiap 5s: GET /drops/{slug} → cek active_stage.stage_type === 'public_sale' && price === '0'
//    (guard: jangan fire kalau price != 0 — FREE rule operator)
// 3. Saat aktif: fetch calldata SEMUA wallet PARALEL via POST /drops/{slug}/mint {minter, quantity}
//    (gagal per-wallet di-skip, sisanya tetap jalan — Promise.allSettled)
// 4. Broadcast paralel (nonce per wallet, chainId 4663, gasLimit 400k, ceiling 0.5 gwei)
// 5. Sleep ~10s → verify receipt semua
```

- `POST /drops/{slug}/mint` butuh `x-api-key: OPENSEA_API_KEY` (dari `/home/ubuntu/mint-wallets/.env`).
- `GET /drops/{slug}` juga pakai key-nya (tanpa key bisa 503/401).
- Timezone: stage times dalam UTC — bandingkan dengan `date -u` server, jangan asumsi WIB.
- Setelah stage target lewat, `active_stage` gak langsung flip di API tiap detik — poll 5s cukup.

## Verifikasi

- `getMintStats(address)` 1-arg di NFT contract bisa gagal "could not decode result data" (KOH) — jangan grind, fallback receipt-decode Transfer events atau cukup andalkan drops API success + receipt status.
- OpenSea collection info: `GET /api/v2/collections/{slug}` → `contracts[]`, `total_supply` (bisa beda tipis dari on-chain, KOH: 2250 vs 2256 on-chain).

## Bedanya dengan RWAKERS-style race

| | RWAKERS (mint-on-transaction) | KOH (drops API multi-stage) |
|---|---|---|
| Sumber trigger | poll `mintOpen()` on-chain | poll `GET /drops/{slug}` active_stage |
| Calldata | build sendiri (mint selector) | dari `POST /drops/{slug}/mint` (sign as-is) |
| Guard harga | re-read `price()` | `active_stage.price === '0'` |
| WL/free | merkle proof `/api/proof/<wallet>` | stage-based, drops API handle |
