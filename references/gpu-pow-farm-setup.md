# GPU PoW Farm — Setup & Rental Guide (for puzzle-mint PoW tails)

Prepared 2026-08-14. Everything is staged so a GPU can be rented and connected in ~10 minutes when a PoW tail needs cracking. Trigger: a puzzle-mint where the remaining supply needs brute-force hashing (e.g. "3-word phrase from 6,000-word list whose SHA-256 starts with <14 hex>" ≈ 2.2e11 hashes/token).

## Ready-made assets (in this skill dir + ~/.hermes/gpu)

| Asset | Location | What |
|-------|----------|------|
| SSH keypair | `~/.hermes/gpu/gpu_rsa` (+ .pub) | Agent's key to access the rented GPU box |
| CUDA cracker | `scripts/pow-sha256-cracker.cu` | SHA-256 prefix search over "w1 w2 w3" phrases — the PoW tail weapon |
| Claim pipeline | `scripts/puzzle-farm.js` | Commit-reveal farm with CORRECT L1 clock + multi-wallet (fixes the fatal bug) |
| Wordlist | project corpus `wordlist.json` | 6,000-word list for the phrase search |

## Rental steps (operator, ~10 min)

1. **Vast.ai** (best: cheap, per-hour, instant) — sign up → "Rent" → search `RTX 4090` (or 3090/4080).
   - Filter: `verified datacenter`, price < ~$0.5/hr.
   - **Add SSH key:** paste the content of `gpu_rsa.pub` (agent generated it — ask the agent to show it, or it's in `~/.hermes/gpu/gpu_rsa.pub`).
   - Rent → copy the SSH command they show (e.g. `ssh -p 22xxx root@123.45.67.89`).
2. **RunPod** (alternative): Pods → GPU → RTX 4090 → deploy → add the same SSH public key → get SSH command.
3. **Send the SSH command to the agent** (the agent already has the private key at `~/.hermes/gpu/gpu_rsa` — it connects with `ssh -i ~/.hermes/gpu/gpu_rsa -p <port> root@<ip>`).
4. GPU box setup (agent does it): install CUDA toolkit + nvcc, copy wordlist + cracker, compile, run.

## Connecting the agent to the GPU

Agent runs (from this VPS):
```bash
ssh -i ~/.hermes/gpu/gpu_rsa -p <port> -o StrictHostKeyChecking=no root@<ip> \
  'nvidia-smi && nvcc --version'
```
Then: `scp` the cracker + wordlist up, compile with `nvcc -O3 -arch=sm_80 pow-sha256-cracker.cu -o pow-cracker`, run per puzzle.

## Workflow when a tail is being attacked

```
1. Agent solves the structured puzzles (template parsers) → answers.jsonl
2. Agent ships answers to puzzle-farm.js → commit loop fires (round-robin wallets)
3. PoW-tail tokens: agent ships the puzzle spec to the GPU box
   → ./pow-cracker wordlist.txt <prefix> hits.txt → answers back to pipeline
4. Mint daemon waits L1 height (NOT L2!) then staticCall→send → claim
5. Shut the GPU down when the tail is cleared (per-hour billing!)
```

## Costs (measured guide numbers)

- RTX 4090 ≈ 3-8 Gh/s SHA-256; CPU (SHA-NI) ≈ 250 Mh/s → GPU is 12-30× faster.
- 14-hex prefix (2.2e11) ≈ 1-2 min on a 4090 vs ~15 min on CPU.
- 100 tokens × 2 puzzles × 1.5 min ≈ 5 GPU-hours ≈ **$2-3** on Vast.ai.
- Only rent for the tail; stop the instance when done.

## Rules learned (hard)

- **L1 clock:** Orbit-chain contracts count parent (L1) blocks. `commitMinBlocks=60` = ~15-20 min L1, NOT 6s L2. Read `l1BlockNumber` from `eth_getBlockByNumber`, or calibrate empirically (commit once, read stored block back, compare scales). Getting this wrong = every reveal fires 15 min early = farmers claim everything (our 10/10 losses).
- **Commit first wins** (same delay for everyone) — commit the instant an answer exists, never batch-and-wait.
- `maxPriorityFeePerGas: 0n` (ethers defaults 1 gwei — exceeds a farm wallet's balance on cheap chains); real gasLimit.
- Track unclaimed via Transfer-from-zero logs, not per-token ownerOf.
- **PoW tail math first:** measure the machine's hash rate, compute per-token time, and only attack if it's profitable vs. the floor value. Say the numbers plainly.
- Model note: a strong reasoning model (Claude Opus-class) materially speeds up the structured-puzzle solver phase — worth using for farm sessions.
