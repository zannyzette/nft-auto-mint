# Mint Site `config.js` Recon + Phase-Gated Mint (BTC MACHINES, 2026-08)

Worked: `btcmachine.gg` (RH·BTC MACHINES, Robinhood chain, 10,000 supply, free mint gas-only).

## Key technique — read the site's `config.js` for contract + ABI

Many custom mint sites ship a plain `config.js` loaded by the page (alongside the app bundle) that contains `CONTRACT_ADDRESS`, chain config, and the full ABI **before the mint UI renders it**. When the HTML is an SPA shell with no contract visible:

```bash
curl -sL https://<site>/config.js
```

Look for `window.<SITE>_CONFIG = { CONTRACT_ADDRESS: "0x...", CHAIN: {...}, ABI: [...] }`.
- The ABI in config.js is authoritative and complete — no Blockscout lookup needed.
- It usually documents the exact mint functions the site calls, e.g.:
  - `mint(uint256 quantity) payable` — direct public mint, no signature
  - `mintAllowlist(uint256 quantity, bytes32[] proof) payable` — allowlist needs merkle proof
  - `phase() view returns (uint8)` — 0=off, 1=allowlist, 2=public
  - `publicStart() / allowlistStart() view returns (uint64)` — epoch seconds for each phase
  - `allowlistMax() / maxPerWallet() / mintedBy(address) / allowlistMinted(address)` — limits + per-wallet state
  - `saleActive() view returns (bool)`
- If the site supports testnet rehearsal, config.js may include `TESTNET` + `USE_TESTNET` flag — good for dry-run if still false→mainnet.

## Phase-gated mint pattern (read state before firing)

For contracts with `phase()`:
```js
phase 0 = mint off · 1 = allowlist only · 2 = public open
```
- Public stage ≠ allowlist stage. `mint()` may only succeed when `phase()==2`; the site shows a countdown until then.
- Convert `publicStart` (epoch) to operator TZ before scheduling. Example: publicStart 1786497816 = 01:23:36 UTC = 08:23:36 WIB, matching the site's announced "public mint" time.
- Verify per-wallet status via `mintedBy(addr)` / `allowlistMinted(addr)` before looping; `maxPerWallet` may differ between phases (allowlist 3 vs public 20 — always re-read at fire time).
- Free mint (`price()==0`) still needs gas (~$0.01/token on Robinhood). Supply check: `totalSupply()/MAX_SUPPLY()`.

## Multi-wallet free-mint bot (pattern)

- Direct `mint(quantity)` + free + phase 2 = the easiest bot class: per-wallet balance-aware qty, sequential wallets, one-shot cron at publicStart+~10s.
- ALWAYS respect the operator-control rule: arm the cron as *preparation*, tell the operator, and do NOT fire without their explicit "gas" — they may vet the project's X presence first and decide to skip (see `references/project-vetting-x-presence.md`).
- Before a manual run, check `hermes cron list` for an armed job (double-fire pitfall — cron wins, manual reverts on per-wallet cap).

## Next.js sites (no config.js) — contract address in the RSC flight payload (Legends of the Stonks, 2026-08)

Next.js sites often have NO `config.js`. The contract address + initial state live in the **RSC flight payload** embedded in the HTML as `self.__next_f.push([1,"..."])` script tags. The address is frequently NOT in any JS chunk (it's server-rendered), so grepping chunks finds nothing.

**Recon recipe:**
```bash
curl -sL https://<site> -H 'User-Agent: Mozilla/5.0' -o site.html
# 1. Contract address: grep the raw HTML (RSC payload) — often near "paused":false / chain config
grep -oE '0x[0-9a-fA-F]{40}' site.html | sort -u        # ← check HTML FIRST, not chunks
# 2. Page chunk: grab the app/page-*.js chunk, extract the ABI module
grep -oE '/_next/static/chunks/app/page-[^"]+\.js' site.html
curl -sL "https://<site>$(grep -oE '/_next/static/chunks/app/page-[^"]+\.js' site.html | head -1)" -o page.js
# 3. In page.js, the ABI is an inline module, e.g. "393:(e,t,n)=>{...n.d(t,{b:()=>a...})}" — pull
#    function names from it:  grep -oE 'name:"[^"]+"' page.js | sort -u
#    (worked: publicMint, mintPrice, currentPriceFor, remainingFree, mintedBy, freeMintedBy,
#     MAX_PER_WALLET, MAX_FREE_PER_WALLET, paused, LegendEntered event w/ tba=ERC-6551)
# 4. Site stats API (Next.js route handler) is usually open:
curl -sL https://<site>/api/world   # → {"stats":{"minted":534,...},"feed":[...]} — live mint count + recent txs
```

**Backend-signature mint detection (CRITICAL — don't promise direct-execution):** if the ABI shows `publicMint(bytes32 seedCommitment, uint64 commitmentExpiry, bytes operatorSignature)` (or any mint taking an `operatorSignature`/`authorization` blob), the mint is **backend-gated**: the site's route handler (e.g. `/api/commitment`) issues the signature per wallet. It is NOT a direct contract call you can pre-sign — same class as LP Brokers (`references/backend-auth-gated-mint.md`). StaticCall with a fake signature first; if it reverts, report "backend-signed, manual/API flow" instead of promising execution.

## Worked example values (BTC MACHINES)
- Contract `0x[YOUR_WALLET_ADDRESS]` · Robinhood 4663 · MAX 10,000
- free mint, allowlistMax 3/wallet (public may differ), phase 1 at recon, publicStart 01:23:36 UTC
- ABI read straight from `config.js` — no Blockscout needed.
