# RWAKERS — ERC-8004 Agent-Registry Mint + mintOpen Auto-Fire (2026-08-18, 15/15 SUCCESS)

## Project
- **RWAKERS** (rwakers.xyz) — 5,000 NFT "ERC-8004 agent registry" di Robinhood Chain (4663). Tiap NFT = AI trading agent (10 archetypes/mandates). Art = SVG onchain (PlateRenderer), bukan IPFS.
- 3 contract (semua VERIFIED di Blockscout):
  - Certificate ERC-721: `0x[YOUR_WALLET_ADDRESS]` (name `Rwakers`, symbol `WAKE`)
  - Metadata: `0x[YOUR_WALLET_ADDRESS]`
  - Renderer: `0x[YOUR_WALLET_ADDRESS]`
- Supply 5,000 · public 0.0005 ETH · list 0.00025 ETH (merkle) · free list 1 gratis · MAX_PER_TX 5 · MAX_PER_WALLET 10 · freeCap 1 · discountCap 10.

## Key mechanic: mint opens on a TX, not a countdown
Docs bilang eksplisit: "The mint itself opens on a transaction, not on a countdown." → owner flip `setMintOpen(true)` kapan aja. **Satu-satunya cara siap = poll `mintOpen()` + auto-fire.** Gak ada T-0 yang bisa diprediksi.

## Recon recipe (site SPA + docs)
1. `curl /` — teks utama (supply, price, tier) langsung kebaca di HTML (Vite build, bukan Next.js).
2. `/docs` page — teks lengkap: state machine, trait distribution (WOKEN 60/STIRRING 20/DORMANT 13/CANCELLED 7; plate STANDARD 76/GREEN 10/INVERTED 9/SEAL 5), reputation formula, contracts table, API docs.
3. `/llms.txt` — ringkasan seluruh sistem plain-text (ada `curl https://rwakers.xyz/llms.txt`). Selalu coba ini dulu di site AI-native!
4. `/api/collection` — JSON: supply, price, listPrice, **listSize, freeSize, minted, soldOut**, archetypes. `minted:0` = pre-launch.
5. `/api/chain` — `mintOpen`, `priceWei`, supply, events. Poll endpoint ini atau RPC.
6. `/api/proof/<addr-lowercase>` — per-wallet: `{tier: free|list|public, listed, price, proofs (NESTED!), proof (FLAT)}`. **Gunakan `proof` (flat), bukan `proofs`** — nested array → ethers "invalid BytesLike value".
7. JS: `grep src="/b/*.js"` → main.js kecil (17KB loader) — wallet logic di chunk terpisah (`chunks/wallet-*.js`) yang di-import dinamis; cari `proofFor`/`bestQuote` di sana untuk endpoint proof.

## On-chain verification
- Blockscout `robinhoodchain.blockscout.com/api/v2/smart-contracts/{CA}` → `name`, `is_verified: True`, ABI (list, bukan string).
- Baca state via RPC: `mintOpen`, `price`, `discountPrice`, `listRoot`, `freeRoot`, `MAX_SUPPLY`, `MAX_PER_TX/WALLET`, `totalSupply`, `owner`, `treasury`, `TIER_PUBLIC/LIST/FREE`.
- **Bytecode scan harus PUSH-AWARE** (jangan grep mentah): 0xff muncul 232x di bytecode RWAKERS tapi SEMUA di dalam operand PUSH32 (data konstanta), bukan opcode SELFDESTRUCT. Scan yang bener: walk bytecode, skip operand setelah PUSH1-32, baru cek opcode. Hasil RWAKERS: bersih (cuma 1 INVALID di akhir = normal). Script: `scripts/bytecode-opcode-scan.py`.

## Race script pattern (rwakers-race.js — verified 15/15)
```
1. MINT_PLAN: [{walletIdx, qty, tier}] — wallet 1 free (1x, proof), wallet 2-15 public (2-3x each, tersebar biar tx paralel maksimal, ≤ MAX_PER_TX).
2. Pre-sign SEMUA tx SEBELUM poll: 
   - free: `mint(uint256,bytes32[])` value 0 + proof dari /api/proof
   - public: `mint(uint256)` value = price*qty (baca price fresh sekali di awal)
   - gasLimit 400k, maxFee 0.5 gwei, maxPriority 0.01 gwei, type 2, chainId 4663 eksplisit.
3. Poll `mintOpen()` tiap 1.5s. Pas true → re-read price (price-flip guard) → sign tx (nonce per wallet fresh) → broadcast PARALLEL (Promise.allSettled).
4. Sleep 8s → getTransactionReceipt per hash → decode `Transfer(from=0x0)` untuk tokenIds (IFC parseLog, toLowerCase address compare).
```
- Kunci sukses: pre-sign sebelum live (poll cuma nunggu flip), re-read price sebelum fire, nonce per-wallet (bukan global), Promise.all broadcast.
- Hasil real: detect open 22:38:21 → 15/15 SUCCESS → 31 NFT (1 free + 30 paid) dari supply 120 saat itu (~26%). Biaya 0.015 ETH + gas ≈ $28.

## Free-tier via merkle (wallet 1)
Wallet 1 dapet free list (1 gratis): API `/api/proof/0x0856...` → `tier: free, price: 0 ETH, proof: [9 elemen flat]`. Mint via `mint(uint256,bytes32[])` value 0. Operator cek WL sendiri di website; konfirmasi API cocok.

## File
- Script race: `/home/ubuntu/mint-wallets/rwakers-race.js` (poll + auto-fire, MINT_PLAN configurable).
