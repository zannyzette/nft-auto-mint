# Multi-Wallet Mint Fleet + VPS Hardening

## Why multi-wallet

Per-wallet mint caps make 1 wallet insufficient:
- Rentoids: `WALLET_LIMIT=50` per wallet, 10k supply → 1 wallet can only ever hold 50
- Free-window-global mints: N wallets = N× attempts per window (parallel fire)
- Multi-wallet = N× lottery tickets when floor is real

## Architecture (verified pattern, `/home/ubuntu/mint-wallets/`)

```
mint-wallets/
├── wallets.json            # config: leader + N wallets (address, chain, env path, status)
├── setup-wallet.sh         # OPERATOR runs this — secure PK onboarding (hidden input)
├── wallet-1/.env           # leader wallet (agent's main, symlinked from existing setup)
├── wallet-2..N/.env        # per-wallet PK, chmod 600, one key per file
├── mint-loop.js            # generic loop — `--wallet N --max M`
└── mint-all.js             # parallel loop across wallets (or `--wallets 2,4`)
```

`wallets.json` shape:
```json
{
  "leader": 1,
  "wallets": {
    "1": {"label": "Ketua", "address": "0x...", "chain": "robinhood", "env": ".../wallet-1/.env", "status": "active"},
    "2": {"label": "Wallet 2", "address": null, "chain": "robinhood", "env": ".../wallet-2/.env", "status": "pending"}
  }
}
```

## Control model (operator's stated preference)

- **"mint pake 1 wallet"** → always the LEADER (wallet 1), never a random one
- **"mint pake 5 wallet"** → all wallets in parallel
- **"mint wallet 2 & 4"** → explicit subset via `--wallets 2,4`
- Operator maintains balances per wallet; agent reports address + required top-up amounts

## Secure onboarding (PK NEVER through chat)

1. **Operator creates wallets in Rabby themselves** (seed phrases stay offline on paper — agent never sees them).
2. Operator runs `bash setup-wallet.sh N` on the VPS:
   - `read -s` hidden input (PK not echoed, not in shell history)
   - validates `/^0x[0-9a-fA-F]{64}$/` before writing
   - `umask 177` + `chmod 600` — owner-only
3. Agent updates `wallets.json` with the address (public info, safe in chat).
4. Operator funds each wallet (gas + mint cost).

**Rule:** the agent NEVER generates these wallets, never sees a seed phrase, and never asks for a PK in chat. If the operator pastes a PK in chat, treat as leaked → rotate.

## Threat model honesty (tell the operator this)

- PKs on a VPS are exposed to exactly one realistic vector: **malware/VPS compromise** (keylogger, rogue package, SSH brute-force). Not the agent, not the chat.
- Mitigations ranked:
  1. SSH key auth (disable password login, `PermitRootLogin no`)
  2. Firewall — only open ports actually used (22 + app ports)
  3. `apt update && apt upgrade` regularly
  4. Never install random software on the mint VPS
  5. Never back up `.env` to cloud/screenshot
- Worst case is bounded: hot wallets hold only gas + mint fees (small). Profits/NFTs are swept to the cold wallet that never touches the VPS. This is the design that makes VPS PK storage acceptable.
- Be explicit: signing must stay local (scripts read PK from `.env`, never send it anywhere). All the loop/race scripts in this skill follow that.

## Balance math pitfall (repeated from session)

Do NOT compute gas burn from "initial balance I saw earlier" — the wallet may have been drained by a prior project. Read balance at historical blocks (`eth_getBalance` with old block tags) to find where the real deposit landed, then diff. Rentoids example: assumed $14.90 burned, actually ~$2.14 — the 0.01 ETH was the previous project's funding, not this mint's.
