# ERC-8004 Agent-Registry Mints — Recon Playbook (RWAKERS case, 2026-08-18)

Project type: NFT = AI "agent" identity written into an ERC-8004 registry; the
token IS a certificate (ERC-721) whose art is computed onchain from tokenId and
REDRAWN as the agent "works". Novel mechanics — per OPERATOR CONTROL rule,
EXPLAIN mechanics first, never auto-execute on first contact.

## Case data — RWAKERS (rwakers.xyz, Robinhood Chain 4663)
- Certificate ERC-721 `0x[YOUR_WALLET_ADDRESS]` (symbol WAKE) — verified, NOT proxy, no SELFDESTRUCT/DELEGATECALL (push-aware scan clean)
- Metadata `0x[YOUR_WALLET_ADDRESS]` + PlateRenderer `0x[YOUR_WALLET_ADDRESS]` (onchain SVG, no IPFS)
- ERC-8004 identity/reputation/validation registry: **not deployed yet** at recon time
- Supply 5,000 · price 0.0005 ETH public / 0.00025 list / 1 free (freeCap=1, discountCap=10, MAX_PER_TX=5, MAX_PER_WALLET=10)
- Tiers on-chain: `TIER_PUBLIC=0`, `TIER_LIST=1`, `TIER_FREE=2`; merkle roots `listRoot`/`freeRoot` set at deploy
- **Mint opens via `setMintOpen(true)` owner tx — NOT a countdown** ("opens on a transaction, not on a countdown"). No public T-0 → cannot pre-position; must poll `mintOpen()` + `/api/chain` and fire on flip.

## Recon recipe that worked
1. `curl` homepage + strip tags (python re) → price/supply/status text fast (site is SPA but content in HTML shell).
2. `/llms.txt` — full system spec in plaintext (states, mandates, formulas, endpoints). Check this BEFORE scraping docs.
3. `/api/collection` — JSON: supply, price, listSize (9,285!), freeSize (1,320), minted, soldOut, archetypes. No auth.
4. `/api/chain` — live: `mintOpen`, `supply`, `priceWei`, `block`.
5. `/api/proof/<wallet>` — per-wallet tier check: `{"tier":"public|list|free","listed":bool,"price":"...","proofs":[]}`. **Test fleet wallets here — all 3 tested came back `public` (not on list/free list).**
6. Blockscout `/api/v2/smart-contracts/<CA>` → `abi` (already a list) + `is_verified`. Read every mint/view fn.
7. On-chain state via Alchemy RPC (ethers contract calls): mintOpen, price, roots, caps, MAX_*, totalSupply, owner/treasury.
8. Bytecode scan: **push-aware only** — see `scripts/scan-bytecode-opcodes.py`. Naive 0xff grep false-positives on PUSH32 data (232 "hits" on a clean contract).

## Pitfalls
- listSize/freeSize are LARGE merkle lists (9,285 / 1,320) — most wallets will be `public` tier; don't assume list membership.
- `mint(qty)` vs `mint(qty, proof)` overloads — tier decides which; public = no proof.
- "Rarity" is NOT rolled at mint: state (WOKEN 60/STIRRING 20/DORMANT 13/CANCELLED 7) and plate class (STANDARD 76/GREEN 10/INVERTED 9/SEAL 5) come deterministically from tokenId (`xorshift32((id*2654435761)^0x8004)`). Marketing rarity ≠ tradable rarity; value is narrative, not trait-scarcity.
- Novel-mechanic audit checklist answered: verified ✓, no proxy ✓, no approve needed (payable mint, value=price×qty) ✓, bytecode clean ✓ — but identity registry missing means the "agent" half of the claim isn't live yet. Report that honestly.
