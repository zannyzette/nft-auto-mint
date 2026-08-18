# Global-Window Free Mint Race (worked example: Rentoids)

Class of mint: **FREE mint with a GLOBAL time-window cap** — e.g. "1 free mint per 5 seconds, FCFS across ALL wallets". Different from FCFS allowlist (OpenSea signature) and agentic PoW (puzzle APIs). No signature needed, no puzzle — pure race against every other bot on the chain.

## Worked example: Rentoids (Robinhood chain, Aug 2026)

- Contract `0x[YOUR_WALLET_ADDRESS]` (verified, source `OnChainLandlord.sol`)
- Free lane: `mint(count)` with `msg.value == 0`, **1 slot per 5s window, GLOBAL** (`FREE_PER_BLOCK = 1`, `FREE_WINDOW = 5`)
- Paid lane: `0.002 ETH` per token, no window cap
- `WALLET_LIMIT = 50` lifetime per wallet, `MAX_PER_TX = 10`
- Full free mint-out of 10,000 takes ≥13.9h by design (1/5s)
- On Orbit chains (Robinhood) blocks are minted PER TRANSACTION → per-block caps are meaningless; the 5s window key is the real gate

## Key numbers from a live run

```
Win rate: ~2-3% per attempt (tried every 5s, ~175 attempts → 5 mints)
  - Got hotter as supply shrank / more bots joined
Timing: 5 mints ≈ 41 min; 50 (wallet max) ≈ 5-7h
Gas: ~0.0000002 ETH total for 5 mints (Robinhood, hardcoded EIP-1559, free lane)
Failed attempts burn nonce but NOT ETH (value 0, reverts are cheap)
```

## Why a naive loop underperforms

- You compete with bots that likely do **nonce prefetch + timing precision + VPS close to the sequencer**.
- From a Singapore VPS the RPC round-trip adds latency; you lose the window to faster senders.
- `eth_call` simulation BEFORE sending filters the obvious losers: `staticCall` → if it reverts "Free slots full this block", skip the tx and retry next window (saves nonce).

## Loop script pattern (node/ethers)

1. Read PK from `.env` (chmod 600, never in chat).
2. Pre-check each attempt: `mintsPerWallet` (stop at limit), `nextTokenId` vs `MAX_SUPPLY` (stop if sold out), `mintStart` (stop if not open), `revealSeed != 0` (mint closed).
3. `staticCall` the mint first; only broadcast if it doesn't revert.
4. On revert "Free slots full this block" → wait 2s, retry. On success → wait a full window (5s).
5. Hardcode gas on Robinhood: `gasLimit 250000, maxFeePerGas 0.15 gwei, maxPriorityFeePerGas 0.01 gwei, type 2` (getFeeData is unreliable there).
6. Cap at `WALLET_LIMIT` (50); for more, need more wallets.

Reference implementation: `/home/ubuntu/rentoids-mint/rentoids-loop.js` (node, ethers v6, NODE_PATH to ethers install).

## Progress watcher (cron, no-agent watchdog)

To get pinged per-mint without an LLM per tick:
- Script reads `mintsPerWallet` via RPC, compares to a state file (`.last_count`), prints ONLY when count increased, updates state file. Empty stdout = silent (no delivery).
- Cron job: `no_agent=true`, script in `~/.hermes/scripts/`, schedule `*/2 * * * *`, repeat forever. Script must be plain bash + curl + python3 (no node deps) for the cron runtime.
- State file seeding: set it to current count before starting the watcher.

## Checklist for any global-window free mint

- [ ] Read the verified contract source — find `FREE_PER_BLOCK`, `FREE_WINDOW`, `WALLET_LIMIT`, `MAX_PER_TX`, paid price
- [ ] Check `mintStart` / reveal gate — is it actually open?
- [ ] Check remaining supply (`nextTokenId` / `MAX_SUPPLY`)
- [ ] staticCall-before-send to avoid burning nonces on full windows
- [ ] Set realistic expectations: 2-3% win rate, hours for wallet max — free lane is a lottery ticket, not a supply sweep
- [ ] Paid lane exists on most of these (skip queue) — compute cost; often ~$2-30 for 50 tokens
- [ ] Wallet max 50 → one wallet cannot sweep the collection; multi-wallet = multi-PK management
