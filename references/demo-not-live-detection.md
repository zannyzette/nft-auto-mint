# Demo / Not-Live Project Detection (PonsRIG, 2026-08-15)

Some sites deploy contracts but keep the mint CLOSED until the owner "flips live".
Detecting this early saves hours of grinding. PonsRIG (ponsrig.xyz, Robinhood 4663)
is the worked example: full game economy on-chain, 6 tokenized-stock tokens with real
supply, GPU NFT rig — but mint() reverts for everyone.

## Signature that it's NOT live yet

1. **`staticCall` mint reverts with NO error data** (`execution reverted (no data present;
   likely require(false)`) — a plain `require(false)` gate, not a named custom error.
2. **`openCount() == 0`** (or `minted()==0`) while `minersCount > 0` (82 cards existed =
   seeded/deployed by owner, not public mint).
3. **Side contracts referenced in config are undeployed** — `getCode()` returns `0x` for
   e.g. royaltyReceiver while the main contracts have code. Half-deployed = demo.
4. **Site text says so**: "Demo snapshot — contract deployment flips this live."

## Recon for multi-contract game projects

- Grep the page JS for a **config object literal** — PonsRIG exposes everything in one
  line: `l={mintPriceEth:5e-4,maxSupply:2e4,maxPerTx:8,cooldownSecs:30,mintWindowCap:400,
  mintWindowHours:1,ocMaxLevel:5,levelBonusPct:20,ocEthPerMh:1e-5,...,minerBps:7e3,
  rewardDays:30}`. Extract the full economy without any contract reading.
- Contract addresses live in the same config: `rig:0x...`, `market:0x...`, `mintPass:0x...`,
  `ponsrig:0x...` + 6 stock token addresses (NVDA/AAPL/MSFT/AMZN/GOOGL/META "Robinhood
  Token" ERC20s with real supply).
- The ABI is in the JS chunks as webpack modules; grep `{type:"function",name:"` across
  downloaded chunks to enumerate functions (`mint(uint256) payable`, `claim`, `fuse`,
  `overclock`, `buyRack`, `windowMintsLeft`...).

## PonsRIG economics (context for future similar games)

- Mint: 0.0005 ETH/GPU (~$0.96), max 8/tx, 30s cooldown, window cap 400/hr, max supply 20k.
- 70% of every mint/fee buys the 6 tokenized stocks on-chain; streamed to miners
  pro-rata by hashrate (30-day reward window). Overclock +20% hash/level (max 5), fuse
  2-same → next tier. Early entry = biggest split (GreedCats-style front-run advantage).
- Status at review: NOT live (openCount=0, sim reverts, royaltyReceiver undeployed).

## Rule

When `openCount/minted == 0` AND sim revert has no revert-data, do NOT grind retries or
promise a mint — report "kontrak belum dibuka (demo/not live), tunggu flip" and offer to
re-check when the operator signals the site changed (their community is the trigger, per
operator preference — no watchers).
# Multi-Contract Game Recon + "Not Live Yet" Detection — PonsRIG (2026-08)

Class of NFT game with several interlocking contracts (main token, rig/NFT, market, mint pass,
payment tokens). Worked example: ponsrig.xyz on Robinhood chain — "virtual mining" game where
70% of mint/fees buys tokenized stocks (NVDA/AAPL/MSFT/AMZN/GOOGL/META) distributed pro-rata by
hashrate.

## Recon recipe (Next.js site)

1. `curl` the HTML → find `_next/static/chunks/app/page-*.js` (page chunk holds all config).
2. Grep the page chunk for `0x[0-9a-fA-F]{40}` — the config object names every contract:
   `{rig:"0x...", market:"0x...", mintPass:"0x...", ponsrig:"0x...", royaltyReceiver:"0x..."}`
   and every payment token: `{ticker:"NVDA", token:"0x..."}`.
3. Grep chunks for `name:"<func>"` to enumerate the full ABI without an explorer:
   `mint`, `mintPrice`, `windowMintsLeft`, `windowResetAt`, `mintedBy`, `maxPerWallet`,
   `cooldownLeft`, `passesLeft`, `overclock`, `fuse`, `claim`, `list`/`delist`, `racksOf`.
4. Config object in JS gives the full economy:
   `{mintPriceEth:5e-4, maxSupply:2e4, maxPerTx:8, cooldownSecs:30, mintWindowCap:400,
   mintWindowHours:1, ocMaxLevel:5, levelBonusPct:20, minerBps:7e3, rewardDays:30, ...}`
5. `getCode()` each address (Alchemy + canonical both) — a missing bytecode for a listed
   contract (e.g. royaltyReceiver) = deployment incomplete.

## "Not live yet" detection (openCount=0 trap)

- `openCount = 0` + `mintersCount = 82` → seed cards exist (owner pre-minted) but public mint
  is locked. `openCount` is the reliable "has anyone minted" gauge, NOT totalSupply.
- `mint(1)` staticCall reverts with `execution reverted (no data present; likely require(false))`
  = door closed (require gate), not a bad call. Try the same sim on each candidate contract
  (rig vs market vs mintPass) to find which one gates the mint.
- Site copy confirms: "Demo snapshot — contract deployment flips this live."

## Verdict for the operator

Ready infra + locked door = wait for the flip signal (openCount > 0 or sim passes), then race.
Similar opportunity shape to GreedCats: earliest entrants get the biggest share while the split
pool is small.
