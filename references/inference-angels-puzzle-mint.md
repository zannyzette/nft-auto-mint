# Inference Angels — Full Agentic-PoW Puzzle Mint (worked 2026-08)

7,777 pixel-art angels on Robinhood Chain, each locked behind 1-4 reasoning puzzles ("trials"). Solve → claim free (gas only). Contract `0x[YOUR_WALLET_ADDRESS]`, repo `github.com/jacklarmer/inference-angels`, site inferenceangels.com. Deployed 13 Aug 2026 — **claimed 56% within 2 days by mass farmers** (13/min). We solved all mechanics but got 0 claims (out-raced).

## Mechanics
- Band = ceil(tokenId/101). Band N file: `corpus/v3/public/band-NN.json` → `{tokenId, band, trials:[{n, kind, statement|sealed, hint}], finalStep}`. Trial 1 readable; trials 2+ are `sealed` (base64) — unlocked by the answer to the previous trial.
- 9 puzzle kinds: hunt, cipher, hidden, construct, relic, ottendorf, rule, lattice, chain. Trials by band: 1 (band ≤20), 2 (≤40), 3 (≤60), 4 (above).
- **Final answer**: `sha256("<tokenId>|<trialAnswer1>|<trialAnswer2>|...")` (lowercase hex). **On-chain stored hash**: `keccak256(abi.encode(uint256 tokenId, bytes(finalAnswer)))` — this is what the seeding files (`corpus/v3/seeding/band-NN-hashes.json`) hold. Mine.js `check` does this comparison for free.
- Claim flow: `commit(keccak256(abi.encode(wallet, tokenId, salt, answerBytes)))` → wait 60 blocks → `mint(tokenId, answerBytes, salt)` (commit/reveal).
- Tools: `node miner/mine.js status|show <id>|check <id> --answers f|solve <id> --answers f` (needs RPC_URL + PRIVATE_KEY env).

## Solvers that worked
- **hunt**: word in 6,000-word wordlist (`corpus/v3/public/wordlist.json`) whose sha256 hex starts with given prefix.
- **hidden**: a long run of letters; find spacing s where `letters[start::s]` is a wordlist word.
- **cipher**: Vigenère, key length K given (≤3 brute-force with wordlist scoring).
- **construct**: 3 words, acrostic + lengths + phrase-sha256 prefix. **Try ALL prefix matches** — multiple can match; only one yields the right onchain hash (verify via `check`, then claim).
- **ottendorf**: book cipher — pairs `wordNum-letterNum` → letters from the wordlist.
- **relic**: read colors from the angel's OWN art (32×32 px grid). **Art is NOT on-chain-readable pre-mint** (tokenURI reverts for unminted) — use the site's art engine: `https://inferenceangels.com/art/engine.js` (`artFor(tokenId)` → `{traits, svg, meta}`, deterministic, byte-identical to on-chain — verified). SVG uses MERGED rects (variable sizes) → point-in-rect per cell (16px cells, 512px viewBox), smallest-area rect wins. Key = hex colors joined. **AES-256-CBC**: key = sha256(colors); **IV = first 16 bytes of sha256("<tokenId>|key|<turn>") — the literal string "key", and `<turn>` is the TRIAL index (0 for a single-trial relic, 1 for a relic sitting at trial 2 of a multi-trial angel)** (e.g. 4498's trial-2 relic quoted "4498|key|1"). Plaintext = 4 words (spaces, one answer line).
- Working code: `/tmp/ia-art/solver.mjs` (relic) + `/tmp/claim-batch*.py` (hunt/hidden/cipher/construct/ottendorf).

## Multi-trial (bands 20-77) — sealed decrypt + chained trials
- Trial 1 readable; trial N+1 is `sealed` (base64 AES-256-CBC). **Sealed decrypt**: AES key = `sha256(answer of previous trial)` (as you wrote it); **IV = first 16 bytes of `sha256("<tokenId>|iv|<trialN>")` — the LITERAL string "iv" and the trial INDEX (1-based for trial 2), not the key value** (hint quotes e.g. `"1920|iv|1"`). This differs from the relic pattern (`"<id>|key|0"` with literal "key").
- **Answers file for multi-trial claims: ONE answer per LINE** (mine.js splits on `\n`), trial answers in order.
- Multi-trial answers validate like single: final = sha256(`<id>|<ans1>|<ans2>|...`) → keccak-abi compare.

## Solvers that kept winning races (all matched, lost only by seconds)
- **cipher (ANY key length, instant)** — Vigenère key recovery via **per-position English letter frequency** (ETAOIN weights): for each key position, try 26 shifts over letters at that stride, pick the max-frequency shift. Beats brute force (26^K) entirely; validates with a common-letter ratio ≥0.55. This cracked a K=4 cipher in <1s that brute force couldn't score (plaintext used common words outside the 6,000-word puzzle list — wordlist scoring is a weak validator; frequency is robust).
- **rule puzzles are 2 OR 3 steps** (statement says "exactly N of the steps") — the 2-step solver misses 3-step rules (this caused silent solve failures in the multi-trial batch). Handle N∈{2,3}: permutations of N steps from 11 (sha256/keccak/letters/reverse/atbash/head/tail/rot13/base64/evens/odds), head/tail get N=4..16 sweep.
- **lattice** — constraint satisfaction: parse "X does not carry Y" + "X's object stands after/before Y's", brute-force object permutations for the angel list, answer = `name:object,...` pairs in angel order.
- **chain** — prose step lists (unicode NFC + UTF-8 hashing, base36, vowel counts, last-N chars); too varied to fully automate — solve manually per puzzle (LLM reads steps, computes, ~5-10 min).
- Debug workflow that caught the "silent fail": the claim batch printed bare `?` for failures — capture BOTH stdout+stderr from the solve subprocess and classify: "already claimed" (skip) vs "does not match" (answer wrong — solver bug) vs other. Without classification you can't tell solver bugs from lost races.

## Competition reality (the lesson)
- A hot agentic-PoW mint with high value-per-token gets farmed by mass solvers from hour zero. 2,000+ claimed in day 1, ~13/min sustained. Even the HARD kinds (relic needed art-engine + AES) got swept.
- **To win: start at T-0 with the full solver suite pre-built.** We arrived ~24h late with a half-built suite → 0 claims despite correct answers (lost races by seconds).
- Before committing effort, check claim RATE (status shows totalMinted) and how long since launch. If >1k claimed/day and you're not at T-0, expected value ≈ 0.

## ⚡ PARALLEL COMMIT/REVEAL — the throughput edge (verified 2026-08)
The commit/reveal claim flow (commit → wait commitMinBlocks ≈ 60 blocks/6s → mint reveal) is SERIAL per angel with mine.js, but the contract allows **unlimited parallel pending commitments from one wallet** (commitments stored by hash, not per-wallet — verified: 2 commits from wallet 1 landed same block). Exploit:
```
1. Solve N angels (answers ready)
2. commit(keccak(abi.encode(wallet, tokenId, salt, answerBytes))) for ALL N (sequential nonces, fast)
3. wait commitMinBlocks ONCE
4. mint(tokenId, answerBytes, salt) for ALL N (fresh nonces!) → N claims per 6s cycle
```
Pitfalls that cost us the race: (a) **nonces must be re-fetched before the reveal phase** (reusing commit nonces → "nonce has already been used", wasting the whole window), (b) missing interface fragments in the signer throws mid-run, (c) the 60-block wait is per-commitment-age, not per-batch — parallel reveals only work if all commits land in the same block window. Even with this edge, a 3-minute script bug lost 2 winnable angels to faster farmers.

## 🏁 FINAL POSTMORTEM (2026-08-14, after ~2 days of fighting)
- **10 valid full solves, 10 lost races** (3292, 3326, 3155, 3218, 3252, 3349, 3771, 4434, 4498 + one more). Every answer passed `check` ("✓ MATCHES"), every reveal reverted with `already claimed` (0xddefae28).
- **The loss mechanism is mechanical, not luck:** solve → commit → wait 60 blocks (~30-60s with RPC polling) → reveal. The farmer(s) claim the SAME angel inside that window — they monitor the chain/mempool and race, or solve on a faster cycle. The 60-block wait is a hard on-chain floor that cannot be shortened.
- **Lessons for the next puzzle-mint:**
  - T-0 start with the FULL solver suite is mandatory; arriving late = the unclaimed pool is only the puzzles the farmers haven't swept, and they sweep every new solve within minutes.
  - The claim cycle (solve → commit → wait → reveal) must be < 20s total and ideally run on multiple wallets in parallel (one angel per wallet) so the farmer can't race all at once.
  - Multi-trial relic IV string is `"<tokenId>|key|<turn>"` (turn = trial index, NOT always 0 — 4498's trial-2 relic used `|1`).
  - Trial-2+ hunts are often 2-WORD phrases (search 6,000×6,000 = 36M, ~30s in Python).
  - Construct puzzles can have 4+ words (167M combos for 8,8,7,7 — parallelize or use node ~3 min).
  - Chain puzzles are fully LLM-solvable (Greek isopsephy, base36/roman, keccak/sha chains) — 6/6 chain solves were valid. Solver patterns in this session's /tmp scripts (solver.mjs = relic, claim scripts = parallel reveal).

## 🚨 THE REAL REASON WE LOST — commit-delay clock (leaked playbook, 2026-08-14)
A miner who claimed 50+ released the playbook. The #1 insight we MISSED:
**On Arbitrum Orbit chains (Robinhood), the contract's `block.number` is the PARENT (L1/Ethereum) chain block (~12-20s each), while `eth_blockNumber` returns the L2 block (~10/s).** A "wait commitMinBlocks=60" delay = **~15-20 MINUTES of L1 time, not 6 seconds of L2 time**. The contract stores `commitBlock` in L1 scale and checks its OWN block.number (L1) — so:
- We revealed after 60 L2 blocks (~40s) → contract said "not old enough" → we retried → farmers (who waited the REAL ~15-20 min) revealed at the right time and claimed → our later attempts hit "already claimed".
- **To time it right:** read the true height from the `l1BlockNumber` field of `eth_getBlockByNumber` (or commit once, read the stored commit block back, and compare scales). Wait until L1 height >= commitL1Block + 60.
- **Bulk pipeline (the winning architecture):** 4 independent processes — (1) solvers appending verified answers continuously; (2) commit loop every ~45s, round-robin across MANY wallets, several tokens per wallet, nonces sequential per wallet; (3) mint daemon polling the parent height, `staticCall` first, send only when it passes, handling reverts (not-ripe = wait, already-claimed/wrong-answer/expired = terminal); (4) watchdog restarting dead processes + refreshing wallets with gas. **Commit the instant an answer exists — first to commit effectively wins** (same delay for everyone). Mark claimed only after receipt confirms.
- **Gas:** pin `maxPriorityFeePerGas: 0n` (ethers defaults 1 gwei — can exceed a farm wallet's whole balance on cheap chains), `maxFeePerGas ≈ 3× gasPrice`, always set real gasLimit. Track unclaimed via Transfer-from-zero logs (1 request per 100k blocks) not per-token ownerOf.
- **The PoW tail:** the final slice is deliberately expensive ("3-word phrase from 6,000-word list whose SHA-256 starts with 14 hex" ≈ 2.2e11 hashes). CPU SHA-NI ≈ 250 Mh/s → ~15 min/puzzle (2 of those per token possible). GPU is 10-30× faster. **Abandon the tail unless a GPU cracker existed before the drop** — say so plainly with measured hash rate.
- **Cryptanalysis beats brute force where it factorises:** Vigenère with known key length = score each of 26 shifts per column with chi-square on English frequency (26·k work vs 26^k). We did this correctly.
- **Model matters for the solver phase:** the successful miner used Claude Max/Opus 4.8 — stronger reasoning = faster/more reliable template parsing + chain solving. DeepSeek flash solved everything eventually, but a stronger model would have cut the per-puzzle time that cost us races.
- **Stop-after-3 rule (operator feedback 2026-08):** when the SAME claim-cycle reverts identically 3+ times in a row (valid solve → commit → wait → "already claimed"), stop and present the structural verdict firmly — even if the operator says "try again". The operator later asked "kalo lu tau kenapa ga bisa, kenapa ga berhenti tadi" — continuing a provably-losing mechanism on persistence burns effort and erodes trust. Three identical failures = mechanism, not luck; say so and hold the line.

## 🧩 Chain puzzles — the manual-reasoning kind (all trial-1 solves verified VALID)
Chain = exact multi-step transforms from a fixed vocabulary. Steps observed and solved (5/5 trial-1s valid: 3155, 3218, 3252, 3349, 3771):
- **Greek isopsephy** (strip accents via NFD + drop combining marks, then map): α1 β2 γ3 δ4 ε5 ϝ6 ζ7 η8 θ9 ι10 κ20 λ30 μ40 ν50 ξ60 ο70 π80 ϟ90 ρ100 σ200 ς200 τ300 υ400 φ500 χ600 ψ700 ω800 ϡ900. Words given as codepoint lists (e.g. εἰρήνη = U+03B5 U+1F30 U+03C1 U+03AE U+03BD U+03B7 → 5+10+100+8+50+8 = 181).
- Base64 no-padding, sha256/keccak hex, base36, Roman (mod-3999 reduction: `((n-1)%3999)+1`, subtractive forms), vowel counts (incl. upper), odd/even char picks (1-indexed!), reverse, head/tail N, ROT13, digit sums.
- **keccak from Python**: pip/pycryptodome may not resolve — shell out to node one-shot (`cwd` must contain a resolvable ethers, e.g. the repo's node_modules): `node -e "const {keccak256,toUtf8Bytes}=require('ethers');console.log(keccak256(toUtf8Bytes(process.argv[1])).slice(2))"`.
- Trial-1 answer = `sha256("<tokenId>|<final-transformed-result>")` — verify with `mine.js check` before committing.

## 🔓 Sealed-trial IV formats — two DIFFERENT literal markers
- **Relic trials**: IV = first 16 bytes of `sha256("<tokenId>|key|0")` — the literal string `key`.
- **Other kinds' sealed trials** (cipher/rule/hunt/construct as trial 2+): IV = first 16 bytes of `sha256("<tokenId>|iv|<trialN>")` — the literal string `iv`, N = 1-based trial index. AES key always = `sha256(prevAnswer)`. Getting the marker wrong produces a partially-garbled first block (later blocks decrypt fine — the giveaway).

## 🔍 Hunt/construct variants in sealed trials
- **2-word hunts**: "Exactly one 2-word phrase ... begins with X" — single-word search fails; scan the full 6,000² space (~36M sha256, ~30s in Python) for `sha256("w1 w2")` prefix. Prefixes are long (10 hex = 40 bits) so the unique match exists by construction.
- **N-word constructs**: generalize beyond 3 words (4-word seen: lengths 8,8,7,7). Multiple phrases match the acrostic+lengths+prefix conditions — **try ALL candidates via `check`** (only one yields the on-chain hash; e.g. 5 hits, 4th was right).
- Multi-trial rule puzzles can be **3-step rules** (not just 2) — step-sequence solver must handle N steps with head/tail N-parameterization; 3-step brute force is ~2.2M combos and times out in Python — keep it in node or skip when rate matters.

## 🏁 Structural verdict (7 valid solves, 7 lost races — the honest close)
We solved 7 angels with byte-perfect answers (every `check` said "✓ MATCHES") and lost EVERY race:
- 2 lost to a nonce bug (3 min), 1 to a lagging-RPC reveal stall (3 min), 4 to the commit+wait cycle (40s–4 min).
- **Even a 40-second commit→wait→reveal cycle loses** — the farmers pre-solve the same puzzles (incl. chain) and their claim cycle is faster. 129 unclaimed chain angels existed; every one we targeted got claimed mid-cycle.
- **mine.js reveal stalls on lagging RPC nodes** ("commitment is not old enough yet" from a behind-node, loops until a current node answers) — during the stall competitors claim. More robust: broadcast the reveal directly (fresh nonce, no staticCall retry loop).
- Conclusion: a saturated agentic-PoW mine (24h+, farmers at ~13 claims/min, full solver parity) is **unwinnable from a reactive position**. Only T-0 start with the complete pre-built suite + continuous parallel-claim automation wins. Check claim rate + hours-since-launch BEFORE committing effort; if >1k/day and you're late, expected value ≈ 0.

## Chain puzzles — isopsephy + step execution (worked: 3218/3252/3349)
- **Greek numeral values (isopsephy)**: α=1 β=2 γ=3 δ=4 ε=5 ζ=7 η=8 θ=9 ι=10 κ=20 λ=30 μ=40 ν=50 ξ=60 ο=70 π=80 ρ=100 σ/ς=200 τ=300 υ=400 φ=500 χ=600 ψ=700 ω=800. Digamma ϝ=6, koppa ϟ=90, sampi ϡ=900.
- **Strip accents/breathing FIRST**: NFD-normalize the word, drop Mn-category combining marks, then map plain letters. Precomposed Greek (U+1F00-1FFF, U+03AC/03AE/03AF etc.) decomposes under NFD (e.g. εἰρήνη → ε ι ρ η ν η after stripping = 181).
- **Step vocabulary to implement**: sha256/keccak (hex, no 0x) / base64 (strip `=`) / base36 / roman (subtractive, mod-3999 range first) / vowel count (a,e,i,o,u, y never) / odd-even char picks (1st,3rd,5th… vs 2nd,4th,6th… — read the indexing carefully) / reverse / head-tail N / rot13 / letters-only / digit-sum. "Treat text as Unicode NFC" before hashing. Numbers are base-10.
- **Trial-2 hunts are often 2-WORD phrases** ("Exactly one 2-word phrase… may repeat") — a single-word hunt solver finds NOTHING. Brute-force `w1 w2` over the 6,000-word list (36M sha256 ≈ 30-60s Python, print progress every 1,000 rows).
- **Construct trial-2s can be 4+ words** (e.g. lengths 8,8,7,7 acrostic "tsha") — space explodes to ~167M combos; parallelize (multiprocessing/8 workers) or run in node. **MULTIPLE phrases can match the hash prefix** — collect all hits and check each with `mine.js check` until one says "MATCHES" (check is free; only the true phrase passes the on-chain keccak-abi hash).
- **keccak from a Python helper**: `node -e` subprocess REQUIRES a cwd containing ethers' node_modules (e.g. `cwd='/tmp/ia-art'`). Without it, `require('ethers')` fails and the subprocess returns empty → the chain answer silently becomes wrong (looked like a solving bug, was a cwd bug).

## The 9-for-9 race loss — claim-cycle speed is the wall (final, 2026-08)
We solved **9 unclaimed angels with 100%-valid answers** (every `check` said "✓ MATCHES"): 3292, 3326, 3155, 3218, 3252, 3349, 3771, 4434, 4498 — and lost EVERY claim race to the farmers. 4434/4498 were full 3-trial solves (chain→rule→hunt and chain→relic→hunt) with a ~30-40s commit→wait→reveal cycle — still lost. **The farmers appear to watch on-chain commits (or run their own continuous solve+claim loop on the same puzzles) and claim within the 60-block wait window every single time.**
- `mine.js solve`'s reveal phase uses a **staticCall retry loop that can STALL 3+ minutes on a lagging RPC node** ("the commitment is not old enough yet" answered by a behind-node) — lost 3155 while it spun. FIX: write your own commit/reveal script (direct `broadcastTransaction`, **fresh nonce before the reveal phase**, keep the salt in memory).
- **Sequential commits spread across dozens of blocks under RPC slowness** (3 commits landed over 58 blocks) — commit wait + slow commits = 3-5 min window in which competitors grab the same angel.
- **CONCLUSION: against a 24/7 mass-farming operation, a REACTIVE cycle (solve → commit → wait → reveal) can never win**, even with a complete, proven solver suite. Winning requires T-0 start + a fully automated solve+claim loop + sub-60s commit→reveal cycle. Do not start a hot puzzle mine 24h late expecting any claims — the farmers solve everything we can and claim it minutes faster.
