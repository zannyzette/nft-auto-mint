# Race RPC Ops, Dynamic Window, and Post-Project Revoke (2026-08-15)

Session learnings from Merge Cats (dynamic window), Legend of the Stonks (commitment API),
PonsRIG (demo-lock), and the Alchemy rate-limit email. All verified live.

## 1. RPC load-splitting — never hammer an API-keyed RPC

Alchemy free tier sent a rate-limit warning after our race script polled at 25-40 req/s
for hours (burst limit ≈ 330 CU/s; the email was the FIRST warning, not a block — it
recovers once load drops, burst-tested 15 parallel calls all 200 OK after the fact).

**The split that works:**
- HEAVY polling (window/supply reads every few s, receipt checks, balanceOf loops) →
  public canonical RPC `rpc.mainnet.chain.robinhood.com` (~295ms, gratis, unlimited).
- LIGHT polling + FIRE/broadcast → fast API-keyed RPC (Alchemy ~72ms) at LOW volume
  (1 call / 5s = 720/hr is fine; 40 calls/s = 144k/hr is not).
- FIRE stays a parallel fan-out across BOTH — first success wins, so fire speed is still
  the fast RPC's latency.

**Auto-429 pattern (in `scripts/mc-free-race-v7.js`):** on any rate-limit error
(`429|rate.?limit|exceeded.*capacity`) from the fast RPC, set a 30s cooldown, route
calls to the fallback RPC, then auto-return when cooldown expires. Broadcast skips the
fast RPC while it is cooling down instead of failing.

**`$5` top-up does NOT help:** the bottleneck is the burst/concurrency rate, not total
quota — topping up adds compute units but not burst headroom. A SECOND FREE APP on the
SAME Alchemy account doubles capacity legally (Create App → NFTs → Robinhood). Creating
a SECOND ACCOUNT (new gmail) is ToS account-farming → risks banning every app on both
accounts; refuse it.

**drpc.org is USELESS on Robinhood (verified 2026-08-15):** answers `eth_chainId` but
rejects `eth_blockNumber` and `eth_getBalance` (`the method ... does not exist/is not
available`). Remove it from RPC fallback lists. PublicNode (`robinhood.rpc.publicnode.com`)
returns "unsupported platform"; Ankr needs its own API key.

## 2. Dynamic free-window duration — DO NOT hardcode WINDOW

Merge Cats flipped its free-lane window mid-race: 5s → 10s → 24s → 1s → 3600s (60 min).
A script with a hardcoded WINDOW + wall-clock boundary firing goes 0-wins indefinitely
once the duration stops being a multiple (5 vs 24).

**v7 design (final, beats all earlier versions):**
- PROACTIVE wall-clock fire: `boundary = now + (periodMs - now % periodMs)` where
  `periodMs = freeWindow() * 1000`, re-read `freeWindow()` every 5s; fire at
  `boundary - LEAD` (165ms). No RPC round-trip between detecting the window and firing.
- Rejected: v6's reactive signal-trigger (watch `nextWindowIn()`/`currentWindow()` then
  arm). Detection itself costs an RPC round-trip (~100-200ms) — every fire lands late,
  which reads as "we never win" against hardened competition. Measurement showed
  `currentWindow()` frozen at 1 and `nextWindowIn()` frozen at 1 for whole seconds —
  useless as a trigger at 1s windows.
- Restart-safe: sync `balanceOf` per wallet at start (don't assume 0 — `Number(null)=0`
  when an RPC read fails silently, which makes full wallets re-fire and burn nonces).
- **Win-logging misses in fast windows:** at 1-2s windows the receipt check drops a
  pending tx before its receipt lands; the NFT mints but the log shows no WIN (on-chain
  grew 32→38 while log showed 0). Fix: on pending-drop, read `balanceOf(wallet)` and
  credit `bal - minted` as `WIN xN via balance`. Always quote on-chain totals to the
  operator, not log WIN lines.
- Auto-stop when `freeMinted >= freeCap` (supply exhausted) — operator wants "selesai
  pas supply abis".
- Project can also LOCK the free lane to 1/hour (freeWindow=3600) to slow farmers —
  recognize this as "not worth chasing", report and stop per the mechanical-failure rule.

## 3. Post-project revoke workflow (operator preference, 2026-08-15)

Operator asked explicitly: after finishing with a project, they want approvals revoked.
"kalo gw udah selesai dengan project tersebut gw bakalan minta revoke seperti ini".

- Drain risk comes from APPROVALS, not private keys: a scam site gets one approve /
  setApprovalForAll and can pull everything later.
- Found in audit: the Robinhood Brokers mint left `allowance = MAX_UINT` from $BROKER to
  the Undertaker contract on wallets 1-4, never revoked. Revoked all to 0.
- Tool: `scripts/revoke-approvals.js` — `--erc20 <token> --spender <addr>` or
  `--nft <nft> --operator <addr>`, `--wallets 1-10`, plus `--audit` mode to check first.
  After revoke, VERIFY allowance == 0 on-chain before reporting done.
- Add a revoke step to the post-mint/post-project checklist; offer it unprompted when a
  project closes. Audit targets: ERC-20 `allowance(wallet, spender)` for every contract
  the project touched; ERC-721/1155 `isApprovedForAll(wallet, operator)` for known
  marketplaces (OpenSea Seaport 0x[YOUR_WALLET_ADDRESS] etc.).
- Best practice to tell the operator: approve EXACT amounts, or revoke immediately after
  the mint finishes — never leave MAX_UINT sitting.

## 4. Backend-commitment mint class (Legend of the Stonks)

`publicMint(bytes32 seedCommitment, uint64 commitmentExpiry, bytes operatorSignature)`
payable, price read per-wallet via `currentPriceFor(wallet)` (0 = free).

Flow: `POST /api/commitment/mint {address}` → `{commitment, expiry, signature}` →
staticCall sim → broadcast with `value = currentPriceFor(wallet)` → receipt → optional
`POST /api/operator/reveal {tokenId}`.

Gotchas learned live:
- **Public commitment API can be closed mid-race.** The endpoint worked open, then
  started returning `"commitments are issued to the Kingdom's own gate"` (backend flipped
  to browser/session-gated) — an automatable mint becomes manual-only overnight. Check
  the API response SHAPE every attempt; a changed error string means the mechanism moved.
- Backend RPC failures cascade: their own Alchemy key 429'd, so the commitment API threw
  `RPC Request failed`/`seed store unavailable: upstash 400` for everyone. Not our fault,
  but the auto-retry loop (15s, 120 attempts) is the right posture — grab the window when
  their backend blinks.
- **Out-of-gas at 300k gasLimit:** sims passed (staticCall ignores gas), broadcast reverted
  with gasUsed ≈ 299,123 / 300,000. Fix: gasLimit 1,000,000 (cheap on Robinhood, refunded).
- **ethers v6: `broadcastTransaction()` returns an object, not a string** — use `h.hash`,
  else `getTransactionReceipt(h)` throws "invalid argument: hex string has length ... want
  64" and every tx looks stuck/never-confirmed. Verified: nonces advanced on-chain while
  the script thought everything was pending.
- `MAX_FREE_PER_WALLET` can differ from the site's "max 3 per wallet" claim (on-chain said
  2 free, 3 total). Read both from the contract.

## 5. Demo-lock detection (PonsRIG)

Site said "Demo snapshot — contract deployment flips this live." On-chain confirmed the
lock: `mint(uint256)` exists in the ABI (deployed bytecode present) but `mint(1)` staticCall
reverts with bare `require(false)` (no error data), `openCount() == 0`, and one infra
contract (royaltyReceiver) not deployed. `minersCount` rising (82→89) was the owner
seed-minting, not a public open.

Rules: presence of bytecode ≠ live mint. Check `openCount`/`totalMinted` + a staticCall
sim BEFORE promising execution. "Sold out" reports from the operator are often "locked /
not yet open" — verify which before agreeing.

## 6. Token-usage honesty for background runs

When a race/retry script runs in the background, the operator asked whether it burns their
LLM tokens. Answer pattern: the NODE script itself costs 0 tokens (pure HTTP to RPC/APIs);
what costs tokens is the chat turns (context size × turns). Advise `/compress` when the
conversation is huge, and offer to only check logs when asked (script runs free).
# RPC Rate Limits & Rotation on Robinhood (Alchemy 429, 2026-08-15)

## Incident
An aggressive race loop polling `nextWindowIn`/`currentWindow` every ~30ms (25-40 req/s) for hours ran Alchemy's FREE-tier key into its first rate-limit warning (email). Alchemy free tier ≈ 330 CU/s burst; a 30ms poll loop exceeds it. Lesson: **load-split, don't pay.**

## RPC reality on Robinhood (measured 2026-08-15)
| RPC | Latency | Full support? | Rate limit |
|---|---|---|---|
| **Alchemy** (`robinhood-mainnet.g.alchemy.com/v2/<key>`) | ~72-81ms | ✅ yes | ⚠️ free tier bursts (~330 CU/s) |
| **Canonical** (`rpc.mainnet.chain.robinhood.com`) | 295-860ms | ✅ yes | none |
| **drpc** (`robinhood.drpc.org`) | ~84ms | ❌ **only `eth_chainId`** — `eth_blockNumber`/`eth_getBalance` → "method does not exist" | — |
| PublicNode / 1RPC / Ankr | — | ❌ not available / need keys | — |

**drpc is USELESS as a general RPC on Robinhood — do not add it to fan-out lists.**

## Load-splitting rule (the fix)
1. **Heavy/continuous reads** (poll loops, per-wallet balanceOf scans, receipt checks) → **canonical** (slow but unlimited).
2. **Fire/broadcast + light reads** (window read every 5s, one-offs) → **Alchemy** (fast, low volume = safe from 429).
3. **429 auto-handling**: match `429|rate.?limit|exceeded.*capacity|capacity.*exceeded` → per-key cooldown (~30s) → fall through to next RPC → resume automatically. Race never dies from a rate limit.
4. **Dual-key rotation**: a SECOND free app on the SAME Alchemy account (dashboard → Create App → product **NFTs** → chain Robinhood) is legitimate and doubles burst. **Do NOT farm keys across multiple accounts/emails — ToS violation, risks banning every account including the working one.**
5. **Small top-ups are not worth it** ($5 ≈ 8-20M CU): the constraint is BURST rate, not total quota (free = 300M CU/month ≈ months of normal use). Only pay (~$49/mo Growth) for a 30-50 wallet farm.

## Key storage
Both Alchemy keys in `/home/ubuntu/mint-wallets/.env` as `ALCHEMY_KEY_1` / `ALCHEMY_KEY_2` (chmod 600). Never print values.

## Implemented in
`scripts/mc-free-race-v7.js`: `FAST_RPC = [1,2]` (both Alchemy keys), canonical at index 0, `alchemyAvailable(i)` per-key cooldown, `handleRateLimit(i)` logs + 30s cooldown, `callRpc` order = alchemy#1 → alchemy#2 → canonical, `broadcast` fan-out skips cooled-down keys.

## Costs to quote the operator (they asked "gimana kalau topup $5 / awet gak")
- Free tier 300M CU/month ≈ months of normal use → $5 top-up is wasted.
- Burst rate is the real wall → dual free key beats $5.
- Alchemy create-app flow: Create App → product "NFTs" (recommended section) → Robinhood chain → copy `alch_...` key. Fill description like a real dApp dev ("NFT minting automation for our dApp marketplace…") to pass review.

# Post-Mint Revoke + RPC Rate-Limit & Rotation (2026-08-15)

Two operational lessons from the Merge Cats / multi-project session: the operator's
post-mint revocation requirement, and the Alchemy free-tier rate-limit incident.

## 🔒 POST-MINT REVOKE WORKFLOW (operator requirement)

The operator was drained once by a malicious site and now requires: **when a project
is finished, revoke every approval/allowance left behind.** He said it explicitly:
*"kalo gw udah selesai dengan project tersebut gw bakalan minta revoke seperti ini"* —
treat "selesai dengan project" as the trigger to offer/run revocation.

- **Root cause of drains:** approve-unlimited (MAX_UINT) or setApprovalForAll(true) to
  a contract, then forgetting to revoke. The approved contract can pull tokens/NFTs at
  any time without the private key.
- **Audit BEFORE revoking** — real find on our own fleet: the Robinhood Brokers mint
  left `$BROKER` allowance to Undertaker (`0x5Adec1c5...`) at `2^256-1` (unlimited) on
  wallets 1-4, unnoticed for days. All revoked to 0.
- **Script:** `scripts/revoke-approvals.js`
  - `--erc20 <tokenAddr> --spender <addr> --wallets 1-10` → sets allowance to 0
  - `--nft <nftAddr> --operator <addr>` → setApprovalForAll(false)
  - `--audit --erc20 <token> --spender <addr>` → check first, no tx
  - RPC = canonical (rate-limit-safe), gas ~24k (~$0.01/wallet), verifies receipt
- **Routine:** after any mint that required approve (token-burn mints, Scatter,
  stock-token mints), audit + revoke when the operator says the project is done.
  Also audit `isApprovedForAll` against known marketplaces after marketplace
  interaction: Seaport `0x[YOUR_WALLET_ADDRESS]`,
  Seaport 1.4 `0x[YOUR_WALLET_ADDRESS]`, Blur
  `0x[YOUR_WALLET_ADDRESS]`.
- **Prevention:** prefer exact-amount approve over unlimited where the flow allows;
  revoke immediately after the mint batch completes.

## ⚠️ RPC RATE-LIMIT & ROTATION (Alchemy free tier)

Alchemy free tier **rate-limits on burst** (concurrent requests), not just monthly
quota — aggressive race polling (25-40 req/s from a 30ms loop) triggered the "you hit
the rate limit" email within hours. 429 error text: `Your app has exceeded its
concurrent requests capacity`.

### Verified RPC reality on Robinhood (measured 2026-08-15)
| RPC | Latency | Full methods? | Limit |
|---|---|---|---|
| Alchemy free (own key) | 72-81ms | ✅ | ⚠️ burst-limited |
| Canonical `rpc.mainnet.chain.robinhood.com` | 295-860ms | ✅ | none |
| drpc.org | 84ms | ❌ ONLY `eth_chainId` | — |
| PublicNode / Ankr / 1RPC | — | ❌ unsupported/paid | — |

**drpc.org is USELESS for reads** — `eth_blockNumber`/`eth_getBalance`/`eth_call`
all return `method does not exist`. Remove it from RPC lists entirely.

### Working load split (implemented in `scripts/mc-free-race-v7.js`)
1. **Heavy/looping reads** (receipt checks, balanceOf loops, supply polls) → canonical
   (unlimited, slow is fine — not latency-critical)
2. **Light polling + FIRE/broadcast** → Alchemy (low volume = safe from burst limit;
   72ms wins the race; broadcast is fan-out so first-success wins)
3. **Two Alchemy keys** (operator created a 2nd app on the SAME dashboard account —
   legit. A second gmail account = ToS farming, risk banning everything) → rotate
   key#1 → key#2 → canonical, with **30s cooldown per key on 429** and auto-return.
   Keys in `/home/ubuntu/mint-wallets/.env` as `ALCHEMY_KEY_1`/`ALCHEMY_KEY_2`
   (chmod 600).
4. `broadcast()` fan-out skips any key in cooldown; `isRateLimit()` regex catches
   `429|rate.?limit|exceeded.*capacity`.

### Don't pay to "fix" this
A $5 Alchemy top-up adds ~8-20M compute units — worthless against a burst limit (the
actual constraint) and wasted at normal usage (300M CU/mo free tier). Fix = load
splitting + key rotation, not spending. 2 free apps is the sweet spot; 5+ apps or
multi-account looks like farming and risks account-wide ban.

## 7. DRY SPELL ≠ BROKEN RACE — triage before rewriting a running race script (Merge Cats 2026-08-15)

The "stuck at 42" incident: a 1-slot-global free-lane race went ~6 min without a WIN
line in the log. The agent read that as script failure, killed the WORKING v1 process,
and replaced it with v2→v5 experiments that together lost ~12 min and 0 wins — while
the original was still alive and winning (on-chain total kept rising 42→46 from the
killed process's in-flight txs). The 6-min gap was NORMAL competition variance: bots
took every slot for a few windows, then wins resumed.

**Correct triage when the log shows no wins:**
1. `ps aux | grep <race>` — is the process still alive and firing?
2. `getTransactionCount(wallet, 'latest')` — if the nonce ADVANCED since race start,
   txs ARE landing; the script is not broken, it is just losing the slot (competition /
   timing problem). Nonce FROZEN = real dead script.
3. `totalSupply()` / `freeMinted()` — if supply is rising, the race is live and other
   wallets are winning; we are losing, not stuck.
4. Re-read `freeWindow()` — if the duration changed (5→24s etc.), THAT is a real reason
   to reconfigure (see §2). Otherwise: hold, don't churn.

**Rule:** in a 1-slot-global race, a 5-10 min no-win stretch is variance until proven
otherwise. Version-churn during a dry spell is the gambler's-fallacy twin of grinding:
each "fix" resets the working baseline and burns time. Only rewrite when (a) nonce is
frozen, (b) the window duration changed, or (c) the project closed the lane.
