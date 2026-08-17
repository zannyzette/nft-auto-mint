# OSNM-Z — OpenSea Mint Fallback Tool (evaluated 2026-08-16)

Rust CLI (`github.com/zunmax/osnm-z`, 125★) for OpenSea-hosted SeaDrop mints.
Installed at `~/tools/osnm-z/` (built `target/release/opensea-mint`, 7.7MB).

## Why it exists as a fallback
- **SIWE auth to OpenSea directly** (gql.opensea.io) — mints OpenSea-managed
  collections WITHOUT needing `OPENSEA_API_KEY`. Our drops API depends on the
  dashboard key (can 429/expire); this is the key-less path.
- Multi-wallet (10 self-funded / 25 EIP-7702 sponsored), multicall funding.

## Verified setup on this VPS
- Rust: `curl -fsSL https://sh.rustup.rs | sh -y --profile minimal`, then
  `source ~/.cargo/env`. Build: `cargo build --release` (~5 min first time).
- Config: `.env` (RPC_URL, GAS_LIMIT, WALLET_KEY) + `wallets.json` manifest
  `{"version":1,"wallets":[{"private_key":"0x..","quantity":1}]}`.
- Regenerate config from fleet: `config/generate-config.js` (reads wallet-N/.env,
  writes both files chmod 600, NEVER prints PKs).
- `opensea-mint doctor` → PASS on Robinhood (chain_id=4663).

## ⚠️ REAL LIMITATION (found by testing)
- **`calldata`/`mint` requires EXACTLY ONE active stage** (`NoUniqueActiveStage`
  error, src/multi_mint.rs:590-595). Collections with WL+public simultaneously,
  or any multi-stage drop → tool refuses. Most real collections are multi-stage,
  so this tool is only ~30% useful vs our toolkit.
- Uses OpenSea's **private unstable API** — can break anytime. Fallback only,
  never the primary path.
- **Do NOT use EIP-7702 sponsored mode** — unaudited executor contract,
  Robinhood Orbit support unproven. Self-funded (`SPONSORED=false`) only.

## Verdict
Keep as key-less backup for single-stage OpenSea drops. Primary stays:
drops API (`drops-mint.js`), `seadrop-race-v3.js`, `mc-free-race-v7.js`.
