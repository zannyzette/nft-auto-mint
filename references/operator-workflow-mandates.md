# Operator Workflow Mandates (2026-08-15)

Session-hardened operator preferences that govern HOW mint/race work is done.
These are standing instructions, not one-off fixes.

## 1. Operator provides CA + mint link = skip contract discovery
When the operator sends the NFT contract address (CA) AND the mint link:
- Do NOT spend time grepping page JS / RSC payloads for the contract address.
- Go straight to contract probing (name/symbol/totalSupply/mintPrice/maxPerWallet/
  paused/mintOpen) + the site's config for price/limits/window.
- Save the remaining discovery effort for mint mechanics (which mint fn, backend
  signature? burn token? gate?).
- The operator explicitly asked "akan mempercepat lu tanpa harus cari-cari contact
  addressnya gak?" — yes, and they expect it. Speed is the point of giving CA.

## 2. All reads/probes/scan MUST use Alchemy — canonical is BANNED for reads
- Operator: "semua yang berbau canonical di script hilangin aja pake alchemy,
  karena menurut gw paling worth and cepet buat eksekusi."
- All scripts swept: canonical + drpc removed from every mint/race/recon script.
- Canonical 295-860ms/call vs Alchemy 72ms. Canonical cost us: Reptillians sold
  out during a slow recon, and a 2000-block scan timed out at 180s.
- Two Alchemy keys rotate: `alch_[YOUR_ALCHEMY_KEY]...` (key#1) primary, `alch_[YOUR_ALCHEMY_KEY]...` (key#2)
  backup, 30s cooldown on 429. drpc.org is useless (no eth_blockNumber).
- If the agent is seen using canonical for a read — that is a rule violation.

## 3. Don't over-engineer token-buy routes for exotic DEXes
- Stonkbankers (2-token burn), DoodBoys (BOYS token), AIKO (DAG swap): when the
  burn/payment token trades on a custom router (dagSwapTo nested routes, no
  standard quote/swapExactETH helpers), do NOT blind-reverse-engineer the calldata.
- Cheap = still not worth an hour of decoding. Quote cost in $, tell the operator
  "buy the token manually via the UI / skip".
- AIKO verdict pattern: interview-gated + custom-token-buy = low EV → skip fast
  (3-strikes rule). See `references/ai-gate-interview-mint.md`.

## 4. When a mint is NOT live (demo), say so in one line, don't grind
- PonsRIG pattern: staticCall revert with NO error data + openCount()==0 +
  side-contracts undeployed + site text "demo" = not live yet. Report and wait
  for the operator's signal. See `references/demo-not-live-detection.md`.

## 5. Report costs in $ BEFORE executing, in plain language
- Always answer "berapa biaya" with the $ figure + breakdown table, and the
  real-world caveats (slippage on thin liquidity, burn % permanent, buy-token
  requirement). Operator decides on the $ number, not on technical detail.
