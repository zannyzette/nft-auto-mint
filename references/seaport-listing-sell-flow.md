# Seaport 1.6 Listing / Sell Flow (Robinhood Chain, VERIFIED 2026-08-17, MothBroker)

Sell command: `sell nft 0x<CA> wallet <sel>, <qty> nft di <harga> eth` (sel = single/list/range/all).
Working script: `/home/ubuntu/mint-wallets/mothbroker-sell.js` (project-specific; copy-modify pattern).

## Fakta kunci Robinhood chain
- **Seaport 1.6 = `0x[YOUR_WALLET_ADDRESS]`** — BEDA dari mainnet (`0x...EbF32`). Verified di Blockscout (`/api/v2/search?q=Seaport`).
- **OpenSea Conduit 1 (`0x[YOUR_WALLET_ADDRESS]`) TIDAK deployed** di RH chain (getCode = 0 bytes) → listing pakai **conduitKey = ZERO** dan approve **Seaport langsung** (`setApprovalForAll(CA, Seaport, true)`).
- `getCounter(offerer)` = 0 untuk wallet fresh; counter WAJIB masuk ke OrderComponents + signature.
- Order default: orderType 0 (FULL_OPEN), zone zero, zoneHash zero32, endTime = start + 180 hari, salt random.

## EIP-712 domain & types (Seaport 1.6)
```javascript
domain = { name: 'Seaport', version: '1.6', chainId: 4663, verifyingContract: SEAPORT };
// OrderComponents: offerer, zone, offer[], consideration[], orderType(uint8), startTime, endTime,
//   zoneHash(bytes32), salt(uint256), conduitKey(bytes32), counter(uint256)
// OfferItem: itemType(uint8), token, identifierOrCriteria, startAmount, endAmount
// ConsiderationItem: OfferItem + recipient
// offer: [{itemType:2 (ERC721), token: CA, identifierOrCriteria: tokenId, startAmount:1, endAmount:1}]
// consideration: [{itemType:0 (NATIVE), token: zero, identifierOrCriteria:0, startAmount: priceWei, endAmount: priceWei, recipient: offerer}]
// signature = wallet.signTypedData(domain, types, components)
```
Order payload OpenSea: `{parameters: {...components, totalOriginalConsiderationItems: 1}, signature, protocol_address}`.

## Flow (proven)
1. **Holdings per wallet** — scan mint tx receipts (jangan eth_getLogs full-range: **Alchemy free tier limit 10 block**): `eth_getTransactionReceipt` tiap mint tx → log Transfer (topic0 = sig, topic1 = 0x0 = mint, topic2 = to, **topic3 = tokenId**). Map addr→wallet id via wallets.json. ⚠️ BUG pernah kena: `l.address.toLowerCase() === CA` dengan CA UPPERCASE → never match. Normalize KEDUA sisi ke lowercase.
2. **Approve Seaport** — cek `isApprovedForAll(addr, SEAPORT)` dulu → skip kalau udah true (idempotent). Tx: gasLimit 120k, EIP-1559 0.5/0.01 gwei.
3. **Sign order per token** — offline, no gas.
4. **Save JSON** — `JSON.stringify(orders, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2)` — **tanpa replacer BigInt → TypeError "Do not know how to serialize a BigInt"** (kena 2x: file save DAN fetch body).
5. **Submit OpenSea** — `POST /api/v2/orders/robinhood_chain/seaport1.6/post` → kalau koleksi belum ke-index, **404 semua** (bukan error payload). Lapor jujur: order valid on-chain tapi INVISIBLE — jangan overclaim "listing live".

## OpenSea index check
- `GET /api/v2/collections/robinhood_chain/{CA}` / `robinhood/{CA}` / `arbitrum/{CA}` → semua 404 = belum ke-index (MOTH status 2026-08-17).
- Collection search: `GET /api/v2/search/collections?query=<nama>` → 404 juga kalau gak ada.
- Chain identifier Robinhood di OpenSea v2 = `robinhood_chain` (untuk order post). Drops API pakai slug polos.

## Blockscout API yang WORK vs 422 (recon & holdings)
- ✅ `/api/v2/addresses/{h}` (contract info, token), `/api/v2/smart-contracts/{h}` (ABI — field `abi` udah LIST, jangan json.loads lagi), `/api/v2/addresses/{wallet}/nft?type=ERC-721` (holdings per wallet — tapi **token_id null** di response buat beberapa kontrak), `/api/v2/search?q=` (ketemu Seaport).
- ❌ 422: `/api/v2/tokens/{h}/instances`, `/api/v2/tokens/{h}/transfers`, `/api/v2/addresses/{h}/token-transfers?filter=to:` — jangan buang waktu; pakai receipt-scan (Alchemy) buat token IDs.

## Eksekusi ethers
Script di mint-wallets butuh ethers; resolver kalau MODULE_NOT_FOUND: `NODE_PATH=/tmp/neon-sign/node_modules` (atau `/tmp/inference-angels/node_modules`) — keduanya punya ethers v6. `npm root -g` gak punya.

## Pelajaran
- BigInt replacer di SEMUA JSON.stringify payload order (file + fetch).
- Normalize address lowercase sebelum compare.
- Koleksi belum ke-index ≠ order gak valid — order tetap fulfillable via Seaport kalau ada indexer/fulfiller yang baca. Report status jujur + kasih opsi (tunggu index, revoke approve, dst).
- Seaport approval = standard marketplace approval; kalau project selesai & order expire → revoke (revoke-approvals.js, spender = SEAPORT).
