# Blockscout v2 API Recon — Robinhood Chain (verified 2026-08-17, MothBroker)

Recipe buat recon kontrak di Robinhood Chain via Blockscout API — gratis, no API key, verified data.

## ⚠️ Domain yang BENAR
- ✅ `https://robinhoodchain.blockscout.com` — HTTP 200
- ❌ `https://robinhood.blockscout.com` — **404 "default backend"** (jangan retry, salah nama domain)
- Cara nemu domain yang bener: grep href dari HTML site mint (`grep -oP 'href="[^"]*blockscout[^"]*"' site.html`) — dev biasanya naro link kontrak di situsnya.

## Endpoint yang dipake
| Endpoint | Fungsi | Catatan |
|---|---|---|
| `GET /api/v2/addresses/{addr}` | info token: name, symbol, type (ERC-721/20), total_supply, holders, is_contract | header `accept: application/json` |
| `GET /api/v2/smart-contracts/{addr}` | ABI + compiler version + contract name | **⚠️ field `abi` udah berupa LIST (array JSON), BUKAN string — jangan di-json.loads() lagi** (TypeError: must be str... not list). Pakai langsung. |
| `GET /api/v2/addresses/{nft}/transactions` | ground-truth tx (dipake pitfall WOJAK truncated-proof) | — |

## Baca harga mint on-chain (paling reliable — jangan percaya UI doang)
1. ABI dari smart-contracts endpoint → filter view function harga: `MINT_PRICE()`, `mintPrice`, `getPublicDrop`, dst.
2. Read via Alchemy RPC chainId 4663: `provider.call({to: CA, data: iface.encodeFunctionData(fn)})` — decode tiap hasil.
3. Konversi wei → ETH → USD (coingecko `simple/price?ids=ethereum&vs_currencies=usd`).
4. Sekalian baca: `mintOpen()`, `totalSupply()` vs `MAX_SUPPLY()`, `MAX_PER_WALLET()` — status live + sisa supply + limit.

## 🔧 ethers MODULE_NOT_FOUND dari ~/mint-wallets (2026-08-17)
`~/mint-wallets` gak punya node_modules sendiri dan global prefix (`/home/ubuntu/.local/lib/node_modules`) kosong — script lama (`node drops-mint.js`) ikut gagal MODULE_NOT_FOUND. JANGAN `npm install` di situ (takut ganggu setup lama). Workaround:
```bash
NODE_PATH=<dir-yang-punya-ethers> node script.js
```
Dir yang udah terbukti punya ethers: `/tmp/neon-sign/node_modules`, `/tmp/inference-angels/node_modules`. `require('ethers')` + `require('./rpc-config.js')` jalan normal dengan NODE_PATH itu.

## Contoh nyata: MothBroker (mothbroker.fun, 2026-08-17)
- CA `0x[YOUR_WALLET_ADDRESS]` — ditemuin dari href blockscout di HTML site (recon pertama, bukan dari JS config)
- **MINT_PRICE = 0.00025 ETH (~$0.47 @ ETH $1.9K)**, MAX_PER_WALLET = 10, MAX_SUPPLY = 3333, mintOpen = true (LIVE), supply 710/3333 (~21%)
- **Mekanik batch-raffle + burn-refund:** BATCH_SIZE = 100 (settle per batch), BURN_REFUND_BPS = 8000 (burn NFT → refund 80%), LUCKY_POOL_BPS = 1000 (10% ke pool undian), CLAIM_WINDOW = 259200s (72h), `claimPrize(batchNumber)` + `sweepExpiredPrize()`
- Mint = plain `mint(uint256 quantity)` payable — no sig, bot-able, pre-buildable (klasifikasi: Public mint direct contract)
- Full ABI fungsi config: `BATCH_SIZE`, `BURN_REFUND_BPS`, `LUCKY_POOL_BPS`, `CLAIM_WINDOW`, `MAX_PER_WALLET` — pola umum untuk project raffle/burn-refund; baca semua dulu biar tau mekaniknya sebelum janji analisa ke operator.
