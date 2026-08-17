# Merge Cats / Dynamic-Window Free Mint — Postmortem (2026-08-15)

Lessons from the Merge Cats free-lane race + Legend of the Stonks + PonsRIG recon. Companion to `mc-free-race-v7.js` and `revoke-approvals.js`.

## 1. Project can change the free-window duration MID-RACE — NEVER hardcode WINDOW

Merge Cats flipped `freeWindow()` live: 5s → 10s → 24s → 2s → 1s → 3600s (1/hour) → back. The site UI ("5 detik per mint", "10 detik", "24 detik", "1 sec per 1 nft", "60 menit") tracks the contract value.

- A script with hardcoded WINDOW + wall-clock boundary firing only wins while the duration is a MULTIPLE of WINDOW (5 into 10 → every other fire lands). When duration is NOT a multiple (5 vs 24) the wall-clock boundary misaligns → **indefinite 0-wins** while supply still moves.
- **The fix is NOT "update WINDOW + restart" — stop using the wall clock entirely.** Read the contract's own countdown:
  - `freeWindow()` = window duration (seconds)
  - `nextWindowIn()` = seconds to next window
  - `currentWindow()` = window index (increments each window — usable as a trigger for any duration)
- Fire on the SIGNAL: when `nextWindowIn()==1` → window opens ~1s later → broadcast at `now + (1000 - LEAD)`. For 1s windows the countdown is degenerate (always 1) — use `currentWindow()` increment as the trigger and estimate next boundary from `freeWindow()`.
- Re-read `freeWindow()` every ~5s and log `🔁 WINDOW BERUBAH: Xs → Ys` so you SEE the flip instead of debugging a silent stall.

## 2. REACTIVE currentWindow polling adds ~100-200ms latency — prefer PROACTIVE wall-clock for the fire itself

Two failed intermediate versions:
- **currentWindow-reactive trigger**: detecting the increment requires an RPC round-trip (~80-160ms) BEFORE arming → every fire lands 100-200ms late → loses every slot. v6 used this and went 0-wins.
- **v7 (final)**: proactive — boundary = next multiple of `freeWindow()*1000` from local clock, fire at `boundary - LEAD` (165ms), no detection latency. WON (Merge Cats total ~58 minted incl. 20 sold).

Version history: v1 (wall-clock WINDOW=5) worked while duration was a multiple; v2-v5 experiments (offset calibration, parallel broadcast) were all WORSE; v5 broadcast failed because old pending txs held the nonces (fix: on `already known`/`nonce too low` → re-read nonce, not a failure). **Keep v7, do not resurrect v1-v6.**

## 3. Wins can land WITHOUT being logged — verify on-chain balance, not the log

During fast windows (2s/1s), a winning tx can get its receipt missed (pending released after 3 misses before receipt appears) → NFT lands in the wallet but `WIN` never prints, and the log shows 0. The on-chain `balanceOf` is ground truth: total went 17 → 22 → 32 while the log showed no WIN lines. **Fix in v7: on pending drop, re-read `balanceOf`; if > minted, count the gain as a WIN.** Always cross-check race progress against `balanceOf` per wallet, never the log alone.

## 4. "Stuck at N" ≠ broken — dry spells are normal in 1-slot-global races

Merge Cats free lane = 1 slot GLOBAL per window. A 6-minute dry spell (18 windows, no win) looked like a stall but was normal variance; the same v1 script kept winning (42 → 46) before the window flip. **Do NOT kill a working process on a short dry spell** — check on-chain supply movement (totalSupply rising = race alive), check whether wins are still landing, only reconfigure if the window duration actually changed. The operator's "kok stuck di 42" turned out to be (a) a dry spell then (b) a real window-duration change.

## 5. RPC rate-limit policy (Alchemy free tier — got the "first rate limit" email)

- **drpc.org is BROKEN for reads on Robinhood**: only `eth_chainId` works; `eth_blockNumber`/`eth_getBalance`/`eth_getTransactionCount` return "method does not exist/is not available". Do NOT use drpc in read paths.
- Alchemy free tier ≈ 330 CU/s burst. Polling `nextWindowIn`+`currentWindow`+`freeWindow` every ~30ms = 25-40 req/s sustained over hours = hundreds of thousands of calls → rate-limit warning email. The limit is BURST-shaped, not quota-shaped.
- **Policy: heavy/continuous reads (polling, receipt checks, per-wallet balanceOf loops) → canonical RPC (`rpc.mainnet.chain.robinhood.com`, unlimited, ~300ms slow is fine for reads). Alchemy reserved for (a) FIRE/broadcast fan-out (few calls, needs the 72ms speed) and (b) LIGHT polling (one `freeWindow()` every 5s ≈ 720/h, negligible).** Encoded in v7 as `FAST_RPC` (Alchemy) tried first for light reads, canonical for the rest.
- **Topping up $5 does NOT raise the burst ceiling** (buys ~8-20M compute units — burned in 1-2h of race polling, or years at normal use). Not worth it. A second free Alchemy app doubles burst (~660 CU/s) — the cheap upgrade; don't farm many apps (ToS, ban risk). Verify burst health with a 15-parallel-request test before assuming the key is blocked.

## 6. Backend-commitment mints: API can flip to gate-only + OOG pitfall (Legend of the Stonks)

- Mechanic: `POST /api/commitment/mint {address}` → `{commitment, expiry, signature}` (public, no auth at first) → `publicMint(commitment, expiry, signature)` payable with `value = currentPriceFor(wallet)`. MAX_PER_WALLET=3, MAX_FREE_PER_WALLET=2 (site says 3, contract says 2 — trust contract).
- **The API flipped to gate-only under load**: "commitments are issued to the Kingdom's own gate" + backend RPC errors (`RPC Request failed` on THEIR Alchemy key, `seed store unavailable: upstash 400`, `commitment service unavailable`). When the project's own backend RPC is rate-limited, the mint is dead for everyone until it clears. Not automatable once gate-only → tell the operator plainly, don't grind.
- **OOG pitfall**: `publicMint` with gasLimit 300k → tx reverted with gasUsed 299,123/300,000 = OUT OF GAS (sim passed because staticCall doesn't enforce gas). Fix: gasLimit 1,000,000 (Robinhood refunds unused ceiling; ~$0.01/tx). Signature: gasUsed ≈ limit → raise the limit, don't debug the calldata.
- StaticCall with a fresh commitment is the right pre-flight; but it CAN pass while broadcast OOGs — always check gasUsed vs gasLimit on the receipt.

## 7. PonsRIG recon (demo project, 2026-08-15)

"Virtual mining GPU" — mint NFT GPUs, they mine 6 tokenized stocks (NVDA/AAPL/MSFT/AMZN/GOOGL/META, real ERC20s on-chain), 70% of mint+fees buys stocks distributed pro-rata by hashrate. Config: mintPrice 0.0005 ETH, maxSupply 20k, maxPerTx 8, cooldown 30s, windowCap 400/h, overclock +20%/level. **Still DEMO**: `openCount()=0`, mint `require(false)` reverts, royaltyReceiver not deployed. Detection: "Demo snapshot — contract deployment flips this live" on site + openCount==0 + mint staticCall reverts with no data. Not automatable until owner flips live — no point grinding.
