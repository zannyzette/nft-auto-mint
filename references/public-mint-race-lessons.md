# Public Mint RACE — Lessons (BTC MACHINES + TOADLINGS! + BROKECATSS + CHILDHOOD, 2026-08) — HARD FAILURES

## CHILDHOOD (2026-08-14) — two SELF-INFLICTED race bugs (both fixed in seadrop-race-v3 v3.2)

Paid 0.0001 ETH, 10/wallet, public start 19:20:36 UTC. Race fired at T-0 with 1 nonce/wallet (exact-qty mode). Result: 3 wallets SUCCESS at T-0, 2 wallets REVERTED — and both reverts were OUR bugs, not latency:

- **Bug A — T-0 timestamp edge (wallet 1):** fired when `block.timestamp >= start` (0.4s after start), but the tx was mined in a block whose timestamp was **1 second BEFORE start** (Robinhood blocks ~0.2s cadence but timestamps are 1-second granularity) → `NotActive` revert (gas ~25k, lowest-possible = earliest check). Wallets fired :36.9-:38.5 landed in blocks ≥ start → OK. **Fix: fire when `block.timestamp >= start + 1` (1s buffer), not `>= start`.** Exact-boundary firing is a coin flip on fast L2s.
- **Bug B — pre-existing allowlist mint (wallet 5):** wallet 5 had already minted 1 via `mintSigned` (allowlist) 7 min before public. Our qty-10 public tx → 1+10 = 11 > per-wallet cap 10 → `MintQuantityExceedsMaxPerWallet` revert (gas 38k). The race's dedupe check only skipped when `minted >= QTY`, never adjusted qty down. **Fix: before firing, read `getMintStats(wallet)`; if 0 < minted < QTY, rebuild calldata with `qty = QTY - minted`.** Retry afterwards minted 9 cleanly (1+9=10).
- **General lesson:** check per-wallet `getMintStats` right before EVERY fire (allowlist/earlier stage mints sneak in), and never trust exact-T-0 firing — a 1s timestamp buffer costs nothing on a 24h window but avoids the boundary revert. Both fixes are in `scripts/seadrop-race-v3.js` (v3.2).

## Model choice does NOT affect race outcomes (2026-08, operator asked)

The agent model (DeepSeek flash vs pro, etc.) is **not in the T-0 execution path** — pre-sign, lead-fire timing, and broadcast are all script-side (Node.js). Flash vs Pro at T-0 = identical. Model quality only marginally helps novel-mechanic reverse-engineering and first-try script correctness; a slower model can even hurt when arming a tight window. Never attribute a race loss to the model, and don't spend on model upgrades expecting race wins — infrastructure (VPS geography, RPC tier) is the lever.

## GREEDCATS — 🎉 FIRST RACE WIN (v3.1, 2026-08-12): 84 NFT from a 30 target

- Paid 0.0004 ETH, maxPerWallet 10, public opened 21:00:01 UTC. v3.1: pre-sign 4 nonces × 10 wallets, LEAD sweep at start-500ms (drip 200ms), 800ms broadcast timeout, adaptive RPC (Alchemy primary).
- **Result: 84/84 confirmed on-chain** (wallets minted 9,9,6,6,9,9,9,9,9,9). First success receipts ~21:00:19-25.
- **Why the win:** lead-fired txs (sent pre-start) executed in blocks whose timestamps were ALREADY ≥ startTime — so the "pre-start = revert" fear didn't materialize; the sweep's first 2-3 nonces ALL landed post-start and succeeded, bounded only by maxPerWallet (10 → 3×3=9 per wallet).
- **⚠️ OVER-MINT BEHAVIOR:** with 4 nonces × qty 3 and the per-wallet cap 10, wallets minted up to 9 (NOT the requested 3). Operator wanted 3/wallet, got 84 total instead of 30. Cost $64 vs planned $23. For EXACT-qty requests: use 1 nonce (loses sweep), or cap script at (capLeft/qty) nonces. For "get as many as possible": the sweep is perfect — it self-bounds at maxPerWallet.
- Operator reaction: positive (more staking power for $CASHCAT) but budget-conscious — always report actual vs planned spend clearly.
- First success confirms: lead-fire + drip + fast-RPC + 800ms timeout = competitive even from SG VPS.

## BROKECATSS — PERFECT timing, RPC flood killed the broadcast (NEW failure mode)

- 10,000 supply (public dropCap 1,000, allowlist eating the rest at ~32/min). Paid 0.0002 ETH, 10/wallet.
- Setup: v3 race — pre-sign 4 nonces/wallet × 10 wallets, LEAD sweep started at start-500ms via local clock (correct!), drip 200ms, fan-out 3 RPCs.
- **Timing was RIGHT** (lead fired 17:00:20.500 vs start 17:00:21.000) but **every nonce+0 broadcast hung**: batchBroadcast had NO fetch timeout → when all mint bots hit the same 3 RPCs at T-0, requests hung ~7-8s → by the time they failed, sweep ran +10-26s late → supply gone (10,000/10,000). All 40 txs reverted gas 38,324 (early supply check).
- **Fix (v3.1): hard 800ms AbortController timeout on every broadcast fetch + log the real RPC error.** Fail fast → drip nonces fire on schedule → retry is possible. Never let a broadcast call block the sweep.
- Second lesson: at T-0 the RPCs themselves are the bottleneck — even the canonical RPC + Alchemy + drpc all choked. Fan-out breadth helps only if each path fails fast. Publicnode mirror (1.6s) is useless under an 800ms timeout — don't add slow RPCs.
- Both failure modes now known: (a) Toadlings = physical latency to sequencer; (b) BrokeCatss = RPC flood survival. v3.1 fixes (b); (a) still needs US-East VPS or luck.

## TOADLINGS! — 10,000 supply GONE in <10s despite PERFECT execution

- Setup was textbook: pre-signed all 10 wallets × 10 (mintPublic qty 10, feeRecipient = OpenSea collector, chainId 4663), polled block timestamp, fired at blockTime == startTime exactly, 10 txs parallel to 2 RPCs, all confirmed sent 1.2s after T-0.
- Result: **all 10 reverted** `MintQuantityExceedsMaxSupply(10000,10000)` — gas 38,410/tx (early revert at supply check). Zero loss (~$0.02 total gas).
- Postmortem data: 50 total holders for 10,000 supply; top 2 wallets = 660 + 640 NFTs; public dropCap was 1,000 → the other ~9,000 went via allowlist/signed stages to whales, public stage eaten by bots in the first seconds.
- **Conclusion: pre-sign + T-0 parallel fire is NOT enough when supply is consumed in the same block window.** On drops with dropCap << maxSupply, assume the public portion is gone before your tx mines; only lead-firing + sequencer-queue position or US-East VPS wins. Check holder concentration post-mortem to confirm allowlist dominance — if top holders hold >> cap, the public stage was a formality.

## GAS DOES NOT WIN RACES ON ROBINHOOD — empirical proof (2026-08)

Single sequencer, FIFO by arrival, no gas auction. Evidence: at the Toadlings open,
the winning whale's mint tx had gasPrice **0.0275 gwei / maxPriority 0.0014 gwei** (≈ base),
while our 10 txs carried **7x higher priority fee** and ALL lost. Raising gas only buys
insurance against base-fee spikes — use a 0.5 gwei ceiling (refunded if unused), keep
priority at 0.01 gwei, and spend effort on arrival time instead: lead-fire, RPC fan-out,
fastest-RPC selection (Alchemy 76ms vs canonical 299ms — a full 0.2s block of difference).

## Two-node race architecture (signed-tx relay — keys stay on ONE node)

SG VPS (76-300ms to RPC) loses to US-East bots (~30-50ms) by 1-3 blocks at 0.2s cadence.
Planned upgrade (2026-08): a cheap US-East VPS runs ONLY the fire (no LLM, no keys):

```
SG node (brain, holds PKs):          US node (trigger, keyless):
  1. research + decide                 1. receives pre-signed txs (scp before T-0)
  2. PRE-SIGN all wallet txs           2. at T-0 fires from low-latency position
     (offline, fixed nonces)              (~30-60ms RTT vs sequencer)
  3. relay signed hex → US node        3. reports hashes back to SG
```

Signed raw txs are safe to share (unforgeable, fixed nonce) — this gives the latency win
WITHOUT duplicating private keys. Pre-sign happens minutes before the drop (no time
pressure); only the broadcast needs to be fast.

## BTC MACHINES — 10,000 supply sold out in 18 seconds

## The failure
BTC MACHINES (RH·BTC) public mint: 10,000 supply, ~7,973 remaining at public open.
**Sold out in 18 SECONDS.** Our 10 wallets: 0 minted.

Setup that failed: cron job triggered 14s after publicStart (08:23:50 vs 08:23:36),
script did read-state → sign → broadcast sequentially. Supply died before we fired.

## Root causes (in order of blame)
1. **Cron-at-time ≠ race.** For a hot public mint, a scheduled trigger that fires
   AFTER the flip is already dead. The flip is the STARTING GUN, not the deadline.
2. **No pre-sign.** mint(quantity) calldata is CONSTANT → signable hours before.
   We instead read state + signed + estimated in the hot path = 3-4 RPC round-trips
   of extra latency. Bot with pre-signed tx fired in the first milliseconds.
3. **No phase polling.** We KNEW publicStart hours ahead. Correct pattern: poll
   phase every 1s, fire the INSTANT it flips to public. We waited for a cron tick.
4. **Wrong competitiveness read.** 81k followers + FREE mint = thousands of
   pre-armed bots. Any wait is fatal. Treat follower count + free as the hardest
   difficulty tier.
5. **Sequential wallet execution.** 10 wallets × 2s sleep = 20s+ to cover all.
   Hot mints need PARALLEL broadcast (all wallets fire together).

## The correct pattern (build this: race-mint.js)
```
1. Preflight: contract addr, mint fn (prefer plain mint/publicMint), price, max
2. PRE-SIGN all wallets BEFORE publicStart (nonce prefetch, hardcoded gas)
3. Poll phase every 1s (cheap eth_call, single RPC)
4. On flip → broadcast ALL pre-signed txs PARALLEL (Promise.all, no sleep)
5. Retry per-wallet if revert; skip already-minted (mintedBy check)
6. Warn operator early: if supply pace near open is insane, say so BEFORE they commit
```

## Decision framework — project competitiveness tier
| Tier | Signal | Strategy |
|------|--------|----------|
| Low | <1k followers, niche, no hype | cron at time is fine |
| Medium | 1-20k followers | pre-sign + poll + parallel |
| High | 20k+ followers, free mint | pre-sign + poll 1s + parallel + expect loss unless VPS near sequencer |

## Honesty rule
When operator says "mint harus berhasil semua wallet" for a HIGH-tier project,
DO NOT just say "siap". Say the honest odds: high-competition free mints are won
by pre-armed bots; our chance is X% without race-mode. Then BUILD race-mode.

## Also learned
- Supply can die in <20s — the "remaining" number you see minutes before means nothing.
- FUWA (Scatter API, signature-backed) was winnable because the API gates everyone;
  direct mintPublic with 0 price is the bloodbath.
- Don't leave cron-only for hot mints. Race script must be STANDING, not scheduled.
