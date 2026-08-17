# Mint Route Playbook — nemuin jalur mint di website BARU (cepat, sistematis)

Tujuan: dari link/CA → TAU jalur mint dalam <5 menit, tanpa muter-muter.
Dibuat 2026-08-15 setelah Cyclops Eyrix (kebuang 20 menit nyari route yang ternyata OpenSea drops API).

## 0. PERTAMA: cek CA langsung (kalau dikasih)
Probe cepat via Alchemy: `name`, `symbol`, `totalSupply`, `maxSupply`, `mintPrice`, `price`, `paused`, `mintingEnabled`, `maxPerWallet`. 
- Ada `mintPrice`/`price` > 0 & live → cari fungsi mint (step 1).
- Semua kosong → cek SeaDrop (step 2) / mungkin bukan NFT (token?).

## 1. DETEKSI TIPE MINT (decision tree)
```
CA punya getSeaDrop() / getPublicDrop() ATAU
tx ke 0x00005EA00Ac477B1030CE78506496e8C2dE24bf5 (SeaDrop)?
  ├─ YES → SeaDrop. Baca getPublicDrop(nft) → price/start/end/cap.
  │        Cek drops API OpenSea: GET /api/v2/drops/{slug}
  │          → drop_type "seadrop_v1_erc721" + is_minting
  │          → kalau ada, PAKAI POST /drops/{slug}/mint (butuh OPENSEA_API_KEY di .env)
  │        Alternatif: mintPublic(nft, feeRecipient, minter, qty) langsung
  │          (feeRecipient = 0x0000a26b00c1F0DF003000390027140000fAa719 — OpenSea collector)
  ├─ NO → cek fungsi mint di bytecode/4byte:
  │     mint() 0x1249c58b | mint(uint256) 0xa0712d68 | publicMint 0x3f1c3c4c/b1b5baa1
  │     → sim value 0 dulu (free?) → sim value price → broadcast
  ├─ NO & butuh signature/backend → cek API site (step 3)
  └─ NO & ada token burn → token-burn flow (references/token-burn-multi-contract-mint.md)
```

## 2. WEBSITE Next.js — cari CA & ABI dari frontend
1. `curl` HTML → grep `<title>`, meta description (sering sebut harga/cap).
2. CA sering ADA di RSC payload: cari `0x[0-9a-f]{40}` di HTML (deket `"paused":false`).
3. Kalau gak ada → download chunk app (`/_next/static/chunks/app/page-*.js`), grep `0x[0-9a-f]{40}`.
4. ABI & konfig sering 1 baris objek: grep `mintPriceEth|maxSupply|maxPerTx|freeWindow|CONTRACT`.
5. API endpoint: grep `"/api/` di chunks → interview/mint/commitment/dll.

## 3. KALAU SIM GAGAL & BINGUNG — GROUND TRUTH = TX SUKSES ASLI
**Ini senjata utama (pelajaran Cyclops):** jangan nebak-nebak struktur.
1. Cari tx sukses terakhir: scan `Transfer` events kontrak NFT di blok terakhir (Alchemy, batch 10 blok).
2. Baca `transactionHash` → `eth_getTransactionByHash` → liat `to` + `value` + selector.
3. Decode calldata: kalau selector gak dikenal, cek 4byte.directory; kalau masih bingung,
   `staticCall` ulang persis argumen tx asli → kalau pass, TIRU persis (ganti minter).
4. Tx asli bisa jadi wrapper/multicall (0x765e827f dkk) — decode dalam-dalam, jangan nyerah di layer 1.

## 4. KASUS KHUSUS (udah ada referensinya)
| Situasi | Route |
|---|---|
| Scatter.art (www Vercel-block) | `api.scatter.art/v1/collection/{slug}` → eligible-invite-lists → POST /v1/mint |
| Commitment API (LOTS) | POST /api/commitment/mint {address} → {commitment,expiry,signature} → publicMint |
| OpenSea-managed (drops) | `POST /api/v2/drops/{slug}/mint` {minter, quantity} → calldata → sign (butuh key!) |
| Token-burn (Brokers) | buy token → approve → raise/burn |
| AI-gate interview (aiko) | interview → voucher → mint(tokenId,deadline,sig) — gate manual |
| Zero-ETH claim | sendTransaction({to, value:0}) |

## 5. PITFALLS ROUTE (jangan jatuh lagi)
- DexScreener `pairAddress` bisa 32-byte pool ID (label "v4") — BUKAN address kontrak. Jangan call token0/token1.
- `getMintStats` signature beda-beda: `(address)` di NFT contract vs `(nft, minter)` di SeaDrop. Coba dua-duanya.
- Error custom tanpa nama: decode selector via ABI lengkap / 4byte. `0xedc01273`=MaxMintedPerWallet, `0x5136e8d5`=FeeRecipientZero, `0x0d35e921`=IncorrectPayment.
- Sim "could not decode result data" ≠ revert — bisa jadi return type beda; coba `staticCall` dgn ABI alternatif.
- API key OpenSea = di `.env` (`OPENSEA_API_KEY`) — drops API MANDATORY butuh key, gak bisa tanpa.
- Kalau >15 menit belum ketemu route: STOP, cari tx sukses asli (step 3), itu selalu jawabannya.
