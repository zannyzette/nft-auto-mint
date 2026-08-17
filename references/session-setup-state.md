# Setup State — as of 2026-08-12 (session: Hood/Sushicat/Brokers/Beeple/Somo + 2 lost races)

## Wallet fleet — 10 wallets ACTIVE (Robinhood chain)
- Leader (ketua) = wallet 1: `0x[YOUR_WALLET_ADDRESS]`
- Wallets 2-10 active in `/home/ubuntu/mint-wallets/wallets.json` (id → {label, address, env, status})
- Per-wallet `.env` chmod 600; PK never in chat; ethers 6.17 via `NODE_PATH=/tmp/neon-sign/node_modules node script.js`
- `distribute.js <amount_eth> <targets|all>` — leader → targets (sequential nonce, chainId 4663 baked in)

## Portfolio this session (all confirmed on-chain, held in mint wallets)
| Collection | Count | Cost | Script |
|-----------|-------|------|--------|
| Hood Skunks (free, SeaDrop) | 30 (10w×3) | ~$0.04 gas | `hood-mint.js` |
| Sushicat (0.00014 ETH, SeaDrop) | 50 (5w×10) | ~$13 | `sushicat-mint.js` |
| Robinhood Brokers (raise/burn $BROKER) | 38 (w1-2:10, w3-4:9) | ~$48 (band 2!) | `brokers-mint.js` |
| beeple (0.000035 ETH, SeaDrop, REAL Beeple x RH) | 50 (10w×5) | ~$3.35 | `beeple-mint.js` |
| Somo On Robinhood (free, 1/wallet) | 10 (10w×1) | ~gas | `somo-mint.js` |
| **Total** | **178 NFT ≈ $65** | | |

## Lost races (cheap lessons, both SOLD OUT)
- **TOADLINGS!** (free, 10/wallet): 10,000 supply gone <10s. Pre-sign + exact T-0 fire STILL lost — physical latency to sequencer. 50 holders / top-2 whales 660+640 / public dropCap 1000 → allowlist dominated, public was a formality.
- **BROKECATSS** (0.0002 ETH, 10/wallet, StonkBrokers hype): timing was PERFECT (lead -500ms) but broadcast fetch hung 7-8s when RPCs flooded at T-0 (no timeout) → swept +10s late → 10,000/10,000 gone. **Fix: 800ms AbortController timeout + error logging (v3.1).**
- Both postmortems: `references/public-mint-race-lessons.md`

## Race scripts (evolution)
- `seadrop-race-v2.js` — lead-fire (500ms) + hedge split (5 lead / 5 T-0) + 3-RPC fan-out
- `seadrop-race-v3.js` (v3.1) — adaptive RPC (measures RTT, uses fastest for poll+fire), **drip-fire 3-4 pre-signed nonces/wallet @200ms sweep**, local-clock precision firing (0.2s blocks make poll-then-fire 3-4 blocks late), JSON-RPC batch, 800ms hard timeout, 0.5 gwei ceiling, `--calibrate` mode
- Usage: `node seadrop-race-v3.js --nft 0x... --qty N [--lead 500] [--drip 200] [--nonces 4] [--lead-wallets 5]`

## Robinhood chain facts (measured this session)
- **Block cadence ~0.2s** (5 blocks/sec) — poll-then-fire is inherently late
- **RPC latency from SG VPS**: Alchemy **76-80ms** (fastest, read+broadcast) · drpc **82ms** (fire-path; reads unreliable) · canonical **298ms** (slowest). RPC origin = Offchain Labs (Arbitrum) behind Cloudflare (Toronto edge for SG).
- **Gas does NOT order FCFS** — single sequencer FIFO. Proof: Toadlings whale won at 0.0275 gwei while we lost at 7x priority fee. Use 0.5 gwei ceiling as free spike-insurance only.
- `irpc.live` (friend's 3ms endpoint) unresolved from SG — likely geo-blocked or OCR-garbled URL; ask friend for exact URL if needed.

## Operator standing instructions (2026-08-12, embedded in SKILL.md OPERATOR CONTROL)
1. Standing approval for ALL mint actions — never ask, execute + report
2. Skip web/X research on OpenSea mint links — contract → config → execute
3. Pre-position before live (pre-sign + stay in poll loop)
4. Operator still supplies the GO per project; price/band changes are agent's call mid-run

## Closed / earlier
- FUWA 50 minted, 47 sold, 3 rarity holds (w3 #1221, w5 #1326/#1332) — USDG offers, accept ≥ $1.20 on operator command
- Rentoids sold out (35 at wallet-1); Neon Nodes sold out; BTC MACHINES sold out 18s (0/10); GRUNKS skipped (dead X)
