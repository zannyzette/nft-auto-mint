# Mint Project Research Recipe (worked: Hood Bits)

## ⚡ Operator shortcut — CA + OpenSea link skips contract hunting (2026-08-15, operator-proposed)
The operator will often paste BOTH the NFT contract address AND the OpenSea collection link in one message ("ini CA + link"). This is the FASTEST recon path:
- CA given → **skip the JS-chunk/RSC-payload address hunt entirely** (that step alone is 5-15 min when the address is buried in `self.__next_f.push(...)` or a config object literal).
- OpenSea link/slug → `GET /api/v2/collections/{slug}` gives chain, contracts, pricing currency, fees, supply in one call.
- Net: recon drops from 10-25 min to **5-8 min** — decisive for catching mints before they sell out (Reptillians went 2,359→4,444 sold out during a slow recon).
- **Probe with ALCHEMY (72ms), never canonical (295-860ms)** — canonical-per-probe made a 10-15 probe recon cost 5-10s extra per stage. See `references/race-rpc-and-revoke-ops.md` §1.

## Speed rule (operator noticed slowness twice — 2026-08)
Sequential round-trips are the #1 time sink on a new project (5-13 min research before the first mint). Keep it tight:
1. **Batch independent probes in ONE call** — OpenSea collection + Blockscout contract + RPC probes can all fire in a single script; don't do them as separate tool calls.
2. **Reuse the proven per-wallet paid-mint script** (pattern in `sushicat-mint.js`/`beeple-mint.js`: balance-aware qty, staticCall sim, retry, dual-RPC, chainId 4663) — only the NFT address, price, and qty change per project.
3. **Don't re-debug solved problems** — feeRecipient=OpenSea collector `0x0000a26b00c1F0DF003000390027140000fAa719`, chainId 4663, 0.15 gwei hardcode are settled; apply them by default for Robinhood SeaDrop mints.
4. Only go deep (error decoding, whale-tx forensics) when the fast path fails.

## Data sources (no login needed)

### OpenSea API v2
- `GET https://api.opensea.io/api/v2/collections/{slug}` — no API key needed (200). Some slugs 401 — retry with exact slug from the collection URL (trailing dash matters: `hood-bits-` worked, `hood-bits` → 401).
- Key fields: `name`, `description`, `total_supply`, `created_date`, `owner`, `fees[]` (royalty + required fees), `contracts[]` (address + chain), `pricing_currencies` (listing currency!), `project_url`, `safelist_status`, `twitter_username`, `discord_url`.
- OpenSea HTML page itself is Cloudflare-protected (403) — use the API, not the page.

### Blockscout (Robinhood chain)
- `GET https://robinhoodchain.blockscout.com/api/v2/addresses/{ca}` → name, `creator_address_hash`, `token.holders_count`, is_contract.
- `GET .../api/v2/smart-contracts/{ca}` → `proxy_type` (eip1167 = clone), `implementations[]` with name. SeaDrop clones show `ERC721SeaDropCloneable` → OpenSea standard mint contract.
- `GET .../api/v2/smart-contracts/{impl}/methods-read` → often 404; probe selectors via RPC instead.

### RPC probes on mint contract (Robinhood RPC is public)
- `name()` 0x06fdde03, `totalSupply()` 0x18160ddd work.
- SeaDrop selectors (`maxSupply` 0x5dbb5db1, `getPublicDrop`/`publicDrop`) often revert pre-announcement — that's EXPECTED before sale opens, not a bug.
- Mint price may not be readable until sale is configured. Check project site/FAQ for mechanics.

### Project website
- Parse for: mint date (often "not announced — follow X handle"), price, supply, mechanics, chain, whitelist vs public stages.
- Check FAQ blocks for mechanics (e.g. zero-loss mint: contract sweeps floor and burns if floor < mint price).

## Hood Bits worked example
- Robinhood chain, `0x[YOUR_WALLET_ADDRESS]`, ERC721SeaDropCloneable (eip1167 proxy), 4,444 supply, ~2,687 minted (60%), 441 holders.
- Listing/pricing currency: **USDG** (not ETH!) — fund the hot wallet in USDG.
- Whitelist application open (quest-based: follow X + tasks); public mint date TBA via `@Hoodbits_`.
- Zero-loss mint mechanic = downside protected by contract.
- Strategy: public stage will be FCFS with bots — follow X for announce, pre-build calldata, gas 1.5-2x at T-0, sweep NFT to cold wallet immediately after mint.

## Checklist additions (pre-mint)
- [ ] Confirm listing currency from OpenSea `pricing_currencies` — fund hot wallet in THAT token
- [ ] Mint date source identified (X handle to watch)
- [ ] Whitelist vs public stage understood; FCFS race plan ready
- [ ] Contract verified + mint function located (SeaDrop clone = standard)

## Eligibility scan (ON REQUEST ONLY — operator rule 2026-08: don't run by default)

When the operator explicitly says "check eligible", scan which fleet wallets qualify:

1. **Stage inventory on the SeaDrop**: `getPublicDrop(nft)` (public = universal eligibility), `getSignedMintValidationParams(nft, signer)` (allowlist — zero-address signer reverts; **signature-based eligibility is server-side, UNCHECKABLE on-chain**), `getTokenGatedDrop(nft, token)` (holder-gate — must know the gated token).
2. **Decode the owner's `multiConfigure` tx** (Blockscout `/transactions/{hash}` decoded_input) — the config tuple shows ALL stages at once: publicDrop tuple, signedParams tuple (empty = no allowlist), allowedSeaDrop. Fastest way to see if a token-gated or signed stage even exists.
3. **Per-wallet minted counts**: `getMintStats(wallet)` → `minted / maxLimitPerWallet` for all fleet wallets (one batch script).
4. **Holder-gate check**: probe `getTokenGatedDrop(nft, candidateCollection)` against collections the fleet actually holds. If every candidate returns the zero tuple → no holder gate exists → answer is "eligible = public stage only".
5. Report as a table: wallet | eligible? | can mint N. State plainly when eligibility is unverifiable (signed allowlist).
