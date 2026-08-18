# RWAKERS — ERC-8004 agent registry mint (Robinhood 4663)

Recon lengkap 2026-08-18. Project: rwakers.xyz — 5,000 "agents" (ERC-8004 identity registry) + ERC-721 certificate. Novel mechanics: plate (64×64 engraving) dihitung onchain dari tokenId, state berubah dari record kerja agent (paper-trading tokenized equity, desk = browser simulation). Bukan yield product (explicit di Docs). "Rarity = residue of work", bukan roll.

## Contracts (semua VERIFIED di Blockscout, bukan proxy, bytecode bersih)
- Certificate ERC-721 "RWAKERS"/WAKE: `0x[YOUR_WALLET_ADDRESS]` (mint, ownership, price tiers, royalties, withdraw)
- Metadata/tokenURI: `0x[YOUR_WALLET_ADDRESS]`
- Plate renderer: `0x[YOUR_WALLET_ADDRESS]`
- Identity registry (ERC-8004): BELUM deploy (saat recon)
- Owner: `0x[YOUR_WALLET_ADDRESS]` | Treasury: `0x[YOUR_WALLET_ADDRESS]`

## Mint mechanics (on-chain verified)
- Tiers: TIER_PUBLIC=0, TIER_LIST=1, TIER_FREE=2 (uint8 view)
- Harga: `price()` = 0.0005 ETH public | `discountPrice()` = 0.00025 ETH list | free = 0
- Limits: MAX_SUPPLY 5000, MAX_PER_TX 5, MAX_PER_WALLET 10, `freeCap` 1/wallet, `discountCap` 10/wallet
- Fungsi: `mint(uint256)` payable (public); `mint(uint256,bytes32[])` payable (list/free, merkle proof)
- State views: `mintOpen()`, `totalSupply()`, `priceFor(who,proof,qty)`, `tierFor(who,proof,qty)`, `freeMinted(addr)`, `discountMinted(addr)`, `mintedBy(addr)`, `listRoot()`, `freeRoot()`

## API (tanpa key)
- `GET /api/collection` — supply, price, listPrice, listSize (9285 saat recon), freeSize (1320), minted, soldOut, archetypes, states
- `GET /api/chain` — enabled, supply, mintOpen, priceWei, lastWoken, events, block ← **endpoint polling race**
- `GET /api/proof/<addr>` — `{tier, listed, price, proofs, proof}` — cek tier per wallet (lowercase addr)
- `GET /api/market`, `/api/market/:id`, `/llms.txt` (spec lengkap plaintext), `/healthz`
- ⚠️ **Proof quirk:** `proofs` = NESTED (`[[h1..h9]]`, 1 elemen berisi list), `proof` = FLAT (`[h1..h9]`). Ambil `proof` dulu; fallback `proofs.flat()`. Salah ambil = ethers `invalid BytesLike value`.

## Timing — RACE TANPA COUNTDOWN
"opens on a transaction, not on a countdown" — owner flip `setMintOpen(true)` tanpa jadwal publik. JANGAN pre-position ke timestamp; **poll `mintOpen()` tiap 1-1.5s, fire paralel pas flip**. FCFS arrival-time (Robinhood single sequencer) — gas ceiling tinggi gak menang, kecepatan broadcast yang nentuin.

## Status saat recon
0/5000 minted, mintOpen=false. Wallet 1 = FREE tier (1 mint, proof ada), wallet 2-15 = PUBLIC (0.0005). Race script: `/home/ubuntu/mint-wallets/rwakers-race.js` — pre-sign 15 tx (w1×1 free, w2×3, w8×3, sisanya ×2 = 30 paid), poll mintOpen, price-flip guard (re-read `price()` sebelum broadcast), fire Promise.all paralel, verify receipt.

## Pitfalls yang kena (detail di SKILL.md Common Pitfalls 22-24)
- ethers v6 overload `mint` → "ambiguous function description" — wajib selector penuh `'mint(uint256)'` / `'mint(uint256,bytes32[])'`
- `require('dotenv')` MODULE_NOT_FOUND dari /tmp/neon-sign — jangan require, baca `.env` via fs + regex
- `wallets.json` = dict `{"1": {label,address,chain,env,status}, ...}` BUKAN array — sort key numerik sebelum index
- PK per wallet: `/home/ubuntu/mint-wallets/wallet-<idx>/.env` → `PRIVATE_KEY=0x...`
