# AI-Interview-Gate Mint (worked: AIKO, aikonft.tech, 2026-08)

Mint class where access is gated by an **AI-graded interview**, not by FCFS/price/allowlist.
The project deliberately filters bots AND model-written answers — the grader is explicitly
tuned to catch answers that "came out of a model". Worked example: aiko (3,333 pixel waifus
that become rentable AI agents, Robinhood chain 4663, contract `0x[YOUR_WALLET_ADDRESS]`).

## Detection signature
- Site copy: *"You get one interview per wallet … no second attempt"*, *"the grader is tuned to
  catch answers that came out of a model"*, *"Nothing to look up, so nothing to paste"*.
- Contract reads: `mintToken()`, `mintFeeWei()`, `mintOpen()`, `hasMinted(wallet)`, `totalSupply()`,
  and the mint function takes a **voucher**: `mint(tokenId, deadline, signature)` payable.
- Backend endpoint: `GET/POST /api/interview?address=<wallet>`.

## Flow (4 steps)
1. `GET /api/interview?address=<wallet>` → `{state: open|done, pools?, turns?, pending?, total}`
   - `state=done` → `{verdict, earnedTier, awardedTier, tokenId, voucher}`
   - `state=open` + `turns` → answer via `POST /api/interview {address, ...answers}` (progress is saved server-side)
2. Interview = ~5 moral dilemmas, no "right" answer; score picks your tier; **1 attempt per wallet, no re-rolls**.
3. On pass: `approve(mintToken, mintPrice)` then
   `mint(BigInt(tokenId), BigInt(deadline), signature)` with `value = mintFeeWei()`.
4. Post-mint: write the agent "brain" (instructions/knowledge) + set hourly rent in USDG (protocol keeps 20%).

## Automatability verdict — NOT fully automatable
- The gate grader is **designed to reject model-written answers**, and one bad answer burns that
  wallet's chance forever. Do NOT promise "agent answers the gate".
- Operator-friendly split: **operator answers the interview manually** (one per wallet), agent
  handles approve + mint + brain upload. A 10-wallet fleet = 10 manual interviews.
- Check token cost first: AIKO mintPrice = 100,000 $AIKO per aiko (price via DexScreener), plus
  an ETH `mintFeeWei`. Total cost in $ must be quoted BEFORE committing.
- Recon: check `totalSupply()`/`mintOpen()`/`hasMinted(wallet)` first — no point deep-diving the
  contract until a voucher exists (the mint tx cannot be pre-signed without the backend signature).

## Pitfalls
- **1 attempt/wallet, no re-rolls** — never test the interview with a real fleet wallet; test with
  a throwaway address or accept the risk on a single low-value wallet.
- **Voucher is backend-signed** (deadline + signature) — cannot pre-sign the mint tx; flow is
  sequential: interview → voucher → approve → mint.
- **Grader anti-AI**: quoting/paraphrasing model-style answers is the failure mode the gate exists
  to catch; if the operator wants fleet-wide mints, they must write human-sounding answers.
- **Gate opens only if wallet already holds the burn token**: `POST /api/interview` → 
  `{"error":"insufficient_balance","required":"100000000000000000000000"}` when `balanceOf(mintToken) == 0`.
  So the buy must happen BEFORE the interview, not after.

## Burn-token buy can be the REAL blocker — custom DAG/hook router
- AIKO `$AIKO` (0x3B6419...BafA) trades on a **DAG-style router** (`dagSwapTo` at
  0xE58b3089...7D6d), NOT plain Uniswap. No `quote`/`swapExactETH` helpers; calldata is nested
  routes + hook data (~600 bytes, easy to mis-encode). Buy txs show `value: 0` (token-in already
  held/approved), which makes the ETH→token path non-obvious.
- Site may have NO buy button (all "buy" strings are FAQ text). No standard factory pool found.
- **Rule: if the burn token needs a custom DAG/hook swap, do NOT reverse-engineer it blind.**
  Options: operator buys via the project UI/DAG manually → agent takes over from approve+mint;
  or skip. Reverse-engineering cost >> $2.38/NFT value.
- Recon trap: DexScreener `pairAddress` on Robinhood can be a 32-byte pool ID (labels "v4") —
  NOT a callable contract address; don't waste time calling `token0()/token1()` on it. Find the
  real swap path by scanning `Transfer` logs of the token and reading the tx `to` + selector
  (wide `getLogs` ranges work on canonical RPC; Alchemy free = 10-block limit).

## Related classes
- Same "backend-issued signature required" family as `references/commitment-api-mint.md`
  (Legend of the Stonks), but with an **interactive human gate** added before the voucher —
  commitment mints are automatable, interview gates are not.
