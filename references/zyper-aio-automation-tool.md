# Zyper Labs — Operator's Mint-Bot Option (research 2026-08-14)

Operator is considering the monthly subscription. This is what the tool covers so future sessions can integrate or advise.

## What it is
Desktop Web3 automation bot ("your bot, your device") — EVM + Solana + BTC minting + wallet/NFT/social management. Friend of the operator uses it on Robinhood mints (tuned delay + gas limit). Site: zyper.app, docs: docs.zyper.app.

## Pricing (2026-08-14)
- 1D $10 · 3D $21 · 7D $32 · 14D $48 · **30-day $60** · 3M $150. All plans = FULL toolkit (no feature tiers). One-time payments, NO auto-renewal.
- Separate service: **ACO** = managed mint execution, "pay 30% of profit only on hits", encrypted wallet flow. Different model (not the monthly plan).

## Capability vs. our agent
| Zyper gives (we DON'T have) | We already cover |
|---|---|
| Solana minting (public/allowlist, Jito/Spam) | Robinhood SeaDrop races (adaptive RPC, lead-fire, drip) |
| **OpenSea listing + WETH offer acceptance** (our instant API key can't read offers — this closes the sell-side gap for our portfolio) | Token-burn mints, drops API allowlist, puzzle PoW (full suite) |
| Social automation (X/Discord/Gmail, follow/reply/repost, CAPTCHA, form submissions) | 10-wallet fleet, parallel claim pipeline |
| Flashbots bundle submission (mainnet-style chains only — NOT relevant on Robinhood's single FIFO sequencer) | Gas/chain physics knowledge for Robinhood |

## Integration note
Zyper is a LOCAL desktop app — runs on the operator's PC, not the VPS. Keys stored encrypted locally on their device. Agent cannot drive it directly; role = strategy, target selection, and post-mint pipeline on our side. If the operator subscribes, the highest-value use is OpenSea listing/offer-accept for our ~500-NFT portfolio + any Solana mints; Robinhood racing stays with us.
