# Mint-on-Transaction Race — RWAKERS (2026-08-18, 31 NFT 15/15 SUCCESS)

Project: rwakers.xyz — 5,000 ERC-8004 agent registry NFTs on Robinhood chain (4663).
Contract `0x[YOUR_WALLET_ADDRESS]` (VERIFIED, non-proxy, no SELFDESTRUCT/DELEGATECALL in push-aware bytecode scan).
Konsep: tiap tokenId nentuin archetype/state/plate deterministik (onchain SVG, no IPFS). 10 mandate archetypes.

## Pola unik: mint buka "on a transaction, not on a countdown"

Gak ada countdown publik, gak ada T-0 yang diumumkan. Owner flip `setMintOpen(true)` kapan aja.
→ Strategi: **pre-sign SEMUA tx dulu, lalu poll `mintOpen()` tiap ~1.5s, fire paralel pas flip.**

## Recon penting

- Site punya API: `GET /api/collection` (supply, price, listSize/freeSize, minted), `GET /api/chain` (mintOpen, supply, events), **`GET /api/proof/<wallet>`** (tier: public/list/free + merkle proof).
- Contract ABI (verified di Blockscout): `mint(uint256)` public + `mint(uint256,bytes32[])` merkle (list/free). `price()`, `discountPrice()`, `tierFor(who,proof,qty)`, `priceFor(who,proof,qty)`, `mintOpen()`, `freeCap`, `discountCap`, `MAX_PER_TX=5`, `MAX_PER_WALLET=10`.
- Harga (verified on-chain): public 0.0005 ETH, list 0.00025, free 0.

## ⚠️ PITFALL: API proof NESTED vs FLAT

`/api/proof/<wallet>` balikin DUA field:
```json
{ "tier":"free", "proofs":[["0x1909...","0xb981...", ...9 elemen...]], "proof":["0x1909...", ...9 elemen...] }
```
- `proofs` = list berisi 1 list (nested!) → ethers v6 reject "invalid BytesLike value"
- `proof` = **flat array** → yang bener buat encode
Rule: pakai `d.proof` dulu, fallback `d.proofs.flat()`.

## ⚠️ PITFALL: ethers v6 overloaded function

Contract punya `mint(uint256)` DAN `mint(uint256,bytes32[])` — `encodeFunctionData('mint', ...)` error
"ambiguous function description". **WAJIB selector eksplisit:**
```js
contract.interface.encodeFunctionData('mint(uint256)', [qty]);
contract.interface.encodeFunctionData('mint(uint256,bytes32[])', [qty, proofs]);
```

## ⚠️ PITFALL: wallets.json format (bukan array!)

```json
{ "leader": {...}, "wallets": { "1": {"address":"0x...","label":"Ketua","env":"/home/ubuntu/mint-wallets/wallet-1/.env","chain":"robinhood","status":"active"}, "2": {...}, ... } }
```
Parse: `Object.keys(wallets).sort((a,b)=>Number(a)-Number(b))` → tiap value `.address`. PK tiap wallet di `wallet-<N>/.env` dengan `PRIVATE_KEY=` (regex `PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})`).

## Script pattern (proven 15/15)

```js
// 1. Baca price on-chain sekali (price-flip guard: re-read SEBELUM broadcast)
// 2. Pre-sign semua wallet:
//    - free: fetch /api/proof/<addr> → encode mint(qty, proof) → value 0
//    - public: encode mint(qty) → value = price*qty
// 3. Poll mintOpen() tiap 1500ms
// 4. Saat open: re-read price → kalau != expected → PRICE-FLIP STOP (operator rule)
//    → signTransaction({...tx, nonce}) → broadcastTransaction paralel (Promise.allSettled)
// 5. Sleep 8s → getTransactionReceipt per hash → lapor status
```

Gas: RH chain — `chainId:4663` WAJIB eksplisit, gasLimit 400k, maxFee 0.5 gwei ceiling (refunded), priority 0.01 gwei, type 2.

## Verifikasi minted (receipt decode)

`getMintStats`/`mintedBy` bisa gagal decode di beberapa contract. Fallback: `getTransactionReceipt(hash)` → parse log `Transfer(from=ZeroAddress)` → tokenId di topics[3]. Atau `mintedBy(wallet)` on-chain (worked di RWAKERS). Fleet hasil: 31 NFT (1 free + 30 paid), supply 0→120 dalam ~detik (bot lain 89 NFT) — 15 tx paralel dari posisi standby itu yang menang.

## Pelajaran operator

- 0/5,000 awake + `mintOpen:false` + docs bilang "opens on a transaction" = ARM script sekarang, jangan nunggu announcement.
- Biaya: 30 × 0.0005 = 0.015 ETH (~$28) + gas sepeser. Operator: "$30 itu banyak lho" — selalu sebut total $ SEBELUM gas.
- Setelah mint: cek balance semua wallet, rebalance wallet tipis (pola `rebalance-5usd.js`: $5/0.0026624 ETH ke wallet <$6, source wallet gemuk, nonce manual increment 4 tx paralel).
