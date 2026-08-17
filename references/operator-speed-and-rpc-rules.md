# Operator Speed & Decision Rules (2026-08-15 session)

Hard-won operator corrections from the Merge Cats → Reptillians → multi-project
session. These are PREFERENCES the operator stated explicitly; violating them
again will read as not-listening.

## 0. Autonomy rules (2026-08-16 additions)
- **AGENT learns to execute — don't spoon-feed the operator** ("lo yg belajar eksekusi masa gw suapin"): if a mint needs extra steps (buy token, swap, approve), the AGENT figures out and executes fully — don't hand manual steps back to the operator ("you buy the token, I'll continue"). Exception: only when a buy path genuinely needs a browser UI that can't be scripted — report with a clear reason, not as a default.
- **Don't ask "should I save/do this?" — just execute and save** ("jangan tanya gw kalo emang menurut lo penting di save, yang ga berguna di buang"): if a lesson is important & reusable → save to skill directly (no asking). If useless → discard. Same for execution decisions already covered by standing approval.
- **Supply intel = operator's job** ("kalo gw minta lo mint pasti supplynya masih ada"): don't waste time checking totalSupply before executing. Operator holds supply intel; if they say gas/mint → execute. If it turns out sold out, report — don't make supply-check a mandatory step.

## 1. RPC: Alchemy-only, canonical/drpc REMOVED (operator mandate)

- Operator said, twice, this session:
  - *"kenapa lo masih pake canonical lagi"* (after catching canonical in scans)
  - *"semua yang berbau canonical di script hilangin aja pake alchemy, karena
    menurut gw paling worth and cepet buat eksekusi"*
- Final config everywhere: 2 Alchemy keys only —
  `alch_[YOUR_ALCHEMY_KEY]-jhbFK5Vp` (primary) + `alch_[YOUR_ALCHEMY_KEY]` (backup),
  ~72ms each, with a 30s 429-cooldown rotation in `mc-free-race-v7.js`.
- canonical (295-860ms/call) and drpc.org (does not support `eth_blockNumber`)
  are GONE from every script — including skill copies. If any script/scan still
  references them, sweep them out (working dir + skill `scripts/`).
- Alchemy free-tier rate-limit is NOT a reason to avoid it for reads: the 429
  email came from a 25-40 req/s poll loop, not from recon. Recon/probing volume
  (tens of calls) is trivially safe.

## 2. Speed = top priority; slow recon LOSES mints (Reptillians)

- Reptillians (0x[YOUR_WALLET_ADDRESS]): recon started at
  supply 2,359/4,444 using canonical sequential probes → sold out to 4,444
  mid-recon. Operator minted 28 manually (sold 10) and was upset:
  *"lo jangan sampe lakuin ini lagi ke gw kalo enggak gw sedih ketinggalan moment"*.
- Rule: recon/probing/scan ALWAYS on Alchemy, probes in PARALLEL, one
  `staticCall` sim then broadcast. Never sequential canonical probes.

## 3. Operator gives CA + link = FAST PATH

- Operator asked: *"kalo ada freemint dari opensea gw kasih CA nftnya dan link
  mint NFT nya akan mempercepat lu gak?"* → YES.
- When CA + link are provided: skip JS-chunk / RSC-payload address hunting
  entirely; go straight to on-chain recon on Alchemy (name/symbol/supply/
  mintPrice/maxPerWallet/paused/mintOpen + mint sim). Prep drops 10-25 min → 5-8 min.

## 4. Operator decision thresholds (quote $ FIRST, then let them decide)

- Stonkbankers: 420 PONS + 42,000 STONKBANKERS + 0.001 ETH fee ≈ $23/NFT with
  50% burn → *"wait n see, terlalu mahal"*. SKIP without grinding.
- DoodBoys: 10,000 $BOYS ≈ $0.10/NFT but supply nearly gone → *"mau abis, next"*.
- Punkx (Scatter free list): API still returned the free list + value-0 tx but
  broadcast REVERTED — the free list had closed on-chain. Operator then saw the
  paid price and declined. Lesson: test ONE wallet broadcast + read the receipt
  before committing the fleet on a late free list (see
  `references/scatter-launchpad-mint.md`).
- Always state total cost in $ (with burn/liquidity caveats) BEFORE executing a
  paid mint; never auto-execute paid without the number on the table.

## 5. Merge Cats dynamic-window takeaway (why v7 exists)

- Project flipped freeWindow 5s → 10s → 24s → 1s → 3600s mid-race. Hardcoded
  WINDOW scripts stall when the duration isn't a multiple. v7 is proactive
  (wall-clock boundary = next multiple of `freeWindow()*1000`, re-read every 5s)
  + Alchemy-only + 429-cooldown. Use v7, not older variants.
