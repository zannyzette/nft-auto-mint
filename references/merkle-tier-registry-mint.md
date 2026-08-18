# Merkle-Tier Registry Mint — RWAKERS (2026-08-18, VERIFIED 15/15)

Mint class: contract dengan 2-3 tier merkle (free/list/public), `mintOpen()` bool,
`mint(uint256)` public / `mint(uint256,bytes32[])` merkle. Race dibuka "by
transaction, not countdown" — owner flip `setMintOpen(true)` tanpa aba-aba.

## Recon recipe (bukan SeaDrop, bukan OpenSea drops API)

1. **Baca docs site** — RWAKERS punya `/llms.txt` + `/docs` yang nge-list semua
   contract address + mekanik (supply, price tiers, rules). Banyak project baru
   sediakan llms.txt buat AI agent — cek DULU sebelum gali JS.
2. **`/api/collection`** → `{supply, price, listPrice, listSize, freeSize,
   minted, soldOut, archetypes...}` — snapshot status tanpa on-chain call.
3. **`/api/chain`** → `{enabled, supply, mintOpen, priceWei, block}` — polling
   endpoint yang dipake site sendiri buat update UI. Bisa dipake buat deteksi
   live selain baca contract.
4. **`/api/proof/<wallet>`** → `{tier: free|list|public, listed, price,
   proofs, proof}` — eligibility + merkle proof per wallet. INI kunci tiering.
5. **On-chain verify via Alchemy** (jangan trust API): `mintOpen()`, `price()`,
   `discountPrice()`, `listRoot()`, `freeRoot()`, `MAX_PER_TX`, `MAX_PER_WALLET`,
   `freeCap`, `discountCap`, `totalSupply()`. Contract verified di Blockscout =
   ABI kebaca langsung.
6. **Wallets.json format** (2026-08-18): `{leader, wallets: {"1": {address,
   label, chain, env, status}, ...}}` — dict, bukan array! Parser harus handle
   dict + sort by numeric key, jangan asumsi array.

## Tier mechanics (RWAKERS case)

- TIER_PUBLIC=0 / TIER_LIST=1 / TIER_FREE=2 (via `tierFor(who, proof, qty)`)
- Public: `mint(uint256 qty)` value = `price()*qty` (0.0005 ETH)
- List: `mint(qty, proof)` value = `discountPrice()*qty` (0.00025 ETH)
- Free: `mint(qty, proof)` value = 0 (1 free per wallet, `freeCap`)
- **Proof dari API bisa 2 bentuk**: `proofs` = NESTED `[["0x...","0x..."]]`,
  `proof` = FLAT `["0x...","0x..."]`. Pakai `proof`, fallback `proofs.flat()`.
  Salah pilih → `invalid BytesLike value` di ethers (array dikira bytes32).

## Race script pattern (rwakers-race.js, VERIFIED 15/15)

```
1. Load wallets dari wallets.json (dict format) + PK dari wallet-<i>/.env (PRIVATE_KEY=)
2. Pre-sign SEMUA tx duluan:
   - free: fetch /api/proof/<wallet> → encode 'mint(uint256,bytes32[])' [qty, proof]
   - public: encode 'mint(uint256)' [qty], value = price*qty
   - gas: 400000 limit, maxFee 0.5 gwei, priority 0.01 gwei, type 2, chainId 4663
3. Poll `mintOpen()` tiap 1.5s (Alchemy) — jangan pakai /api/chain doang,
   on-chain adalah ground truth
4. Saat open → RE-READ price() fresh (price-flip guard) → broadcast PARALLEL
   (Promise.all) dengan nonce manual increment per wallet
5. Verify: decode receipt logs — Transfer(from=0x0) → tokenIds; mintedBy(wallet)
   on-chain; totalSupply
```

**PENTING — overloaded function:** `encodeFunctionData('mint', ...)` FAIL
(`ambiguous function description`) kalau contract punya 2 overload `mint`.
WAJIB full signature: `'mint(uint256)'` dan `'mint(uint256,bytes32[])'`.

## Hasil nyata (RWAKERS)

- 15 wallet pre-sign, poll 1.5s, deteksi open → fire paralel → **15/15 SUCCESS
  dalam ~1 detik** (1 free + 30 paid = 31 NFT, totalSupply 120 saat verify —
  bot lain juga rame, kita dapet 26% dari yang ke-mint).
- Biaya: 0.015 ETH mint + ~0.0001 ETH gas (~$28.4 total buat 31 NFT).
- Auto-fire via background process (node rwakers-race.js) — gak perlu manusia
  standing by; notify_on_complete kasi hasil pas kelar.

## Eligibility tree check — Bunkerhood (2026-08-18)

Project lain (thebunkerhood.com/mint): GTD + WL allowlist, 10K supply,
contract UNVERIFIED di Blockscout tapi frontend pin bytecode hash + owner +
name + symbol (anti-tamper check di JS). Eligibility gak lewat API per-wallet
tapi **merkle tree PUBLIC di predictable path**:

```
/allowlists/gtd-tree.json   → {root, proofs: {wallet: [proof...]}} (1.1MB, 1346 entry)
/allowlists/wl-tree.json    → {root, proofs: {...}} (24MB, 23576 entry)
```

Cek eligibility = download tree JSON → lowercase wallet → lookup di `proofs`.
0/15 eligible → lapor "gak ada di tree" dan SKIP — jangan coba mint (revert
`InvalidMerkleProof`). Frontend JS (Next.js page chunk) juga nunjukin cara
cek: `uf('/allowlists/gtd-tree.json')` → `lf(tree, wallet, root)` match.
Contract check di JS: `of()` bandingin name/symbol/owner/bytecode-hash → kalau
mismatch, site sendiri nge-block ("CONTRACT BLOCKED").

## Lessons

- Project "pre-launch" dengan `mintOpen:false` + "opens on a transaction" =
  race murni. Pre-sign SEMUA dari sekarang, poll, auto-fire — jangan nunggu
  announcement (bisa kelewat, bot lain gak nunggu).
- Baca docs/llms.txt dulu — hemat jam dibanding gali JS bundle.
- API tier/proof endpoint adalah sumber kebenaran eligibility — cek SEMUA
  wallet, jangan asumsi.
- Cost check sebelum paid multi-wallet: total $ + floor value. Operator:
  "$30 itu banyak lho".
