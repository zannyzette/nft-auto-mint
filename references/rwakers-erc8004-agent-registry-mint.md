# ERC-8004 Agent Registry Mint — RWAKERS (2026-08-18, VERIFIED 15/15)

RWAKERS (rwakers.xyz) = 5,000 NFT di **ERC-8004 agent registry** (bukan ERC-721 murni — identity
"agent" dicatat di registry on-chain). Robinhood Chain 4663. Ini pola mint yang beda dari SeaDrop:
**3 contract terpisah** (Certificate ERC-721, Metadata tokenURI, Plate renderer) + registry
identity/reputation/validation. Art 100% onchain SVG — no IPFS.

## Recon ringkas

| Cek | Hasil RWAKERS |
|---|---|
| Supply | 5,000 (MAX_SUPPLY on-chain) |
| Harga | public 0.0005 ETH · list 0.00025 · free list 1 gratis (verified on-chain `price()`, `discountPrice()`) |
| Max | MAX_PER_TX 5 · MAX_PER_WALLET 10 · freeCap 1 · discountCap 10 |
| Tier per wallet | `GET https://rwakers.xyz/api/proof/<wallet-lowercase>` → `{tier: free|list|public, price, proofs[], proof[]}` |
| Mint open | `mintOpen()` bool — **dibuka via tx owner, BUKAN countdown** → polling wajib |
| Contract | verified di Blockscout, bukan proxy, bytecode bersih (push-aware scan: no SELFDESTRUCT/DELEGATECALL asli) |

## Mint functions (overloaded! — pitfall #23)

```
mint(uint256 qty)                    // public — payable, value = price × qty
mint(uint256 qty, bytes32[] proof)   // list/free — merkle proof dari API
```

ethers v6: WAJIB `encodeFunctionData('mint(uint256)', ...)` / `'mint(uint256,bytes32[])'` —
pakai `'mint'` doang → "ambiguous function description".

## Proof API gotcha (pitfall #22)

`/api/proof/<addr>` balikin `proofs` (nested: `[["0x...","0x..."]]`) DAN `proof` (flat:
`["0x...","0x..."]`). **Pakai `proof`.** Kalau fallback: `d.proofs.flat()`.

## Race script pattern (proven 15/15, 31 NFT)

```
1. Pre-sign SEMUA wallet (1 tx/wallet, nonce dari RPC per wallet)
2. Poll mintOpen() tiap ~1.5s (Alchemy RPC)
3. Pas open: re-read price() fresh (price-flip guard), broadcast Promise.all paralel
4. Verify receipt + decode Transfer(from=0x0) → tokenIds per wallet
```

Kunci menang FCFS di Robinhood = **pre-sign sebelum live + fire paralel pas flip** (arrival-time,
bukan gas war). Script contoh: `/home/ubuntu/mint-wallets/rwakers-race.js`.

## Verifikasi hasil

- On-chain `mintedBy(wallet)` / `balanceOf(wallet)` per wallet
- Decode receipt: event `Transfer(from=0x000...0)` → tokenId di topics[3]
- Rarity bukan di-roll: tokenId nentuin archetype/state (deterministik, xorshift32 seed)

## Pelajaran umum

- "The mint opens on a transaction, not a countdown" → jangan cari countdown; arm script
  yang polling flag + auto-fire.
- Price tiers via merkle root (`listRoot`/`freeRoot`) — cek eligibility SEBELUM janji biaya.
- Site API (`/api/proof`, `/api/collection`) = sumber kebenaran tier; contract = sumber harga.
