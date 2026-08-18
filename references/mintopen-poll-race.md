# Mint "Opens on Transaction" — Poll Race Pattern (RWAKERS, 2026-08-18, 15/15 SUCCESS)

Project yang gak punya countdown: mint dibuka owner via `setMintOpen(true)` (atau
setara) KAPAN SAJA, tanpa aba-aba. `totalSupply` diam di 0 sampai flip. Gak bisa
pre-position ke T-0 → **harus POLL `mintOpen()` + pre-sign semua wallet + fire
paralel pas flip**. Ini beda dari seadrop-race-v3 (yang punya startTime eksplisit).

## Recipe (script live: /home/ubuntu/mint-wallets/rwakers-race.js)
1. Recon: contract verified di Blockscout → baca ABI. Baca state: `mintOpen/price/
   totalSupply/MAX_PER_TX/MAX_PER_WALLET` + cek tier tiap wallet via site API
   (`/api/proof/<wallet>` → tier free/list/public + merkle proof).
2. Pre-sign SEMUA tx SEBELUM poll (value = price×qty, gasLimit 400k, chainId 4663,
   type 2, maxFee 0.5 gwei ceiling — refunded kalau gak kepake).
3. Poll `mintOpen()` tiap ~1.5s (Alchemy, 1 call/poll — ringan).
4. Pas open: RE-READ `price()` fresh (price-flip guard — kalau beda dari pre-sign,
   STOP & lapor, jangan broadcast). Broadcast Promise.all paralel.
5. Verify: receipt 8s kemudian + on-chain `mintedBy(wallet)` / `balanceOf(wallet)`
   + decode event Transfer(from=0x0) di receipt buat tokenIds.

## Hasil nyata
- Detected open 22:38:21 → fire 15 tx → **15/15 SUCCESS**, 31 NFT (1 free WL + 30
  paid @0.0005 ETH ≈ $28). totalSupply 120 dalam beberapa menit = bot lain juga gas.
- Robinhood FIFO by arrival: yang menang = kecepatan broadcast, bukan gas.

## Pitfalls (semua kena di sesi ini)
- **ethers v6 overloaded function**: `encodeFunctionData('mint', ...)` GAGAL
  "ambiguous function description" kalau ABI punya `mint(uint256)` DAN
  `mint(uint256,bytes32[])` → WAJIB full signature: `'mint(uint256,bytes32[])'`.
- **`proofs` nested vs `proof` flat**: API proof site bisa balikin DUA field —
  `proofs` = array DALAM array (nested, gak bisa dipake langsung), `proof` = flat
  array hex string. Salah pilih → ethers `invalid BytesLike value`. Pakai `proof`
  (flat); fallback `.flat()` kalau cuma `proofs` ada.
- **wallets.json = dict, bukan list**: format `{leader, wallets: {"1": {address,
  label, env, status}, ...}}` — sort keys numerik, extract `.address`. Jangan asumsi
  array of strings (kena "unsupported addressable value").
- **dotenv module gak ada**: baca `.env` via `fs.readFileSync` + regex langsung,
  jangan `require('dotenv')` (node_modules /tmp/neon-sign cuma punya ethers).
- PK per wallet: `/home/ubuntu/mint-wallets/wallet-<N>/.env` → `PRIVATE_KEY=0x...`.
- ethers via `NODE_PATH=/tmp/neon-sign/node_modules` (aturan existing).

## Eligibility check via PUBLIC merkle tree (Bunkerhood, 2026-08-18)
Banyak project WL/list taruh merkle tree JSON PUBLIC di sitenya:
`/allowlists/gtd-tree.json`, `/allowlists/wl-tree.json`, dll (format
`{root, proofs: {addr: [hashes]}}`). Kadang juga via API per-wallet
(`/api/proof/<wallet>`, RWAKERS).
- **Download tree → cek address wallet langsung** = cek eligibility TANPA connect
  wallet. Ini sumber kebenaran yang sama dengan validasi contract on-chain.
- Bunkerhood: GTD 1,346 entries, WL 23,576 entries — fleet 15 wallet kita **0/15
  eligible** → mint pasti revert `InvalidMerkleProof` → SKIP, jangan gas.
- Tanda project belum layak dikejar: contract unverified + totalSupply=1 + phase
  "CLOSED/DISABLED" + "START: NOT SET" + gak ada public lane → lapor & skip.
- Frontend anti-tamper bagus (Bunkerhood): bytecode hash di-pin + cek
  name/symbol/owner/MAX_SUPPLY di JS — mismatch → site bilang "CONTRACT BLOCKED".
  Bagus buat kepercayaan, TAPI tetap bukan jaminan legit (intel operator > audit,
  pelajaran MINECAT).
