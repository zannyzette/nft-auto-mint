# Agentic-PoW Puzzle Mints — multi-kind puzzle mining (worked: Inference Angels 2026-08)

A free mint where each NFT is locked behind a reasoning PUZZLE ("the kind of job an AI model does well"). No latency race — solve correctly and claim. 7,777 angels on Robinhood Chain, contract `0x[YOUR_WALLET_ADDRESS]`, repo `github.com/jacklarmer/inference-angels`. This is a richer sibling of the Neon Nodes pattern (`agentic-pow-mint-pattern.md`) — same solve→submit loop, but 9 puzzle kinds, sealed multi-trials, and a non-obvious on-chain hash format.

## Detection
- Site: "wall" of numbered items, "solve the puzzle and you may claim", "free mint", "no required model".
- Repo with `miner/mine.js` + `corpus/v3/public/band-NN.json` + `corpus/v3/seeding/band-NN-hashes.json` + a `corpus/v3/deploy.json` (contract, chainId, RPC).
- The project may ship an `AGENTS.md` written for AI agents — read it; it documents the API honestly.

## The nine puzzle kinds (single-trial bands are the easy ones)
| Kind | Solvability |
|------|-------------|
| hunt | scriptable — wordlist word whose SHA-256 starts with given hex |
| hidden | scriptable — letters[start::spacing] against wordlist |
| cipher | scriptable for key length ≤3 (brute force + wordlist scoring) |
| construct | scriptable — acrostic + word lengths + phrase-hash prefix; ⚠️ multi-candidate |
| ottendorf | scriptable — book cipher: word N, letter M from the published wordlist |
| rule | LLM/script — 6 examples, rule built from 2 steps (sha256/keccak/letters/reverse/atbash/...) |
| lattice | logic grid — constraints, unique arrangement |
| chain | exact step list (Base64/Keccak/odd-chars/...), script per puzzle |
| relic | read pixel colours from the on-chain SVG art (contract draws it) |

Rare angels (higher bands) hold up to **4 trials, sealed sequentially** — trial N's answer unlocks trial N+1's text; must be solved in order, cannot parallelize.

## ⚠️ CRITICAL — the on-chain hash format (cost us a long debug)
The published `answerHash` in the seeding files is **NOT** the plain SHA-256. The pipeline is TWO steps:

```
finalAnswer = sha256("${tokenId}|${answers.join("|")}")          // e.g. sha256("337|hordeum asshead corvus")
onchainHash = keccak256(abi.encode(uint256 tokenId, bytes(finalAnswer)))
// published answerHash == onchainHash, NOT finalAnswer
```

mine.js implements exactly this (`onchainHash = keccak256(AbiCoder.encode(["uint256","bytes"], [tokenId, toUtf8Bytes(answer)]))`). If you compare `sha256("337|answer")` against the seeding hash directly you get false negatives forever. Use the project's own `check` command (free) instead of reimplementing the comparison.

## ⚠️ Construct puzzles are multi-candidate
"Acrostic + word lengths + phrase-hash prefix" can have MULTIPLE valid phrases (we found 2 for one angel — only the second was right). Never claim the first hash-prefix hit; collect ALL hits and try each via `check`/`solve` until the on-chain form matches. Wrong answers spend nothing (the contract validates before minting).

## Mining flow
```bash
npm install
node miner/mine.js status                 # claimed / frontier
node miner/mine.js show <id>              # read puzzle (no wallet)
node miner/mine.js check <id> --answers ans.txt   # FREE validation
# answer file = one trial answer per line; format: tokenId|ans1|ans2 joined by |
export RPC_URL=<from deploy.json>
export PRIVATE_KEY=<wallet key>           # never printed
node miner/mine.js solve <id> --answers ans.txt   # claims if valid
```

## ⚠️ Competition reality (worked: 2,800/7,777 claimed in ~26h, ~13/min)
- The easy scriptable kinds (hunt/cipher/hidden in low bands) are swept by OTHER AGENT FARMERS within hours of launch — we solved 322 correctly and got 0 claims (all taken before our loop reached them).
- **Solve + claim in ONE pass** (never check-then-claim-later — the angel gets taken in the gap).
- Verify the corpus matches on-chain first (`node scripts/verify-corpus.js` with RPC+CONTRACT env) so you know your wordlist is the deployed one — it matched here, so a wrong answer means your solver logic, not stale data.
- Check secondary value before investing effort: OpenSea offers existed (~$2.90/angel) — effort only justified if the math works.
- Edge you can still exploit: reasoning kinds (rule/lattice/chain/relic) that pure-script bots solve slowly; per-puzzle LLM work.

## Scripts
- `scripts/puzzle-mint-sweep.py` — bulk solver+claimer (hunt/hidden/construct with multi-candidate handling), per-band solve→claim loop, wallet from `mint-wallets` env, RPC from deploy.json. Adapt puzzle-kind solvers per project.
