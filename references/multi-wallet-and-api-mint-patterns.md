# Multi-Wallet Mint Ops + API Mint Patterns

## 1. Multi-wallet infrastructure (10 wallets, proven)

```
/home/ubuntu/mint-wallets/
├── wallets.json          # source of truth: leader + active wallets, env paths
├── .env                  # ALCHEMY_RPC_FREE / ALCHEMY_RPC_PAID / RPC_BACKUP
├── rpc-config.js         # getRpcs() → {primary, backup, both}
├── setup-wallet.sh       # operator pastes PK (hidden input, chmod 600) per wallet
├── distribute.js         # wallet-1 → send ETH to N wallets in one nonce sequence
├── wallet-1..N/.env      # one PK per wallet, chmod 600, never in chat
└── *.mint.js             # per-project mint scripts (btcm, fuwa, grunks, monkey)
```

Key rules:
- PK NEVER in chat — operator runs `bash setup-wallet.sh <n>` with hidden input.
- Seed phrases live only with the operator (Rabby, offline). VPS holds only PKs.
- `wallets.json` status field gates which wallets scripts use (`all` = active only).
- Distributor pattern: fund wallet 1 → `node distribute.js <amount> 2,3,4,5` → all funded.
- 10 wallets is the proven sweet spot for public mint (limit-per-wallet) farming.

## 2. Anti-double-command guards (cron + manual must not double-mint)

Operator explicitly fears double execution (cron fires + manual "gas" → double mint).
Two guards proven in `btcm-mint.js`:

```
Guard 1 — lock file: acquireLock() writes .lock with PID (flag "wx").
  Second process → either skips (live PID) or takes over (dead PID).
Guard 2 — re-check mintedBy() immediately before broadcast; skip if already
  minted/claimed. Even if two processes race, only the first lands.
```

Operator protocol (IMPORTANT): when operator asks "gimana mint?" — CHECK LOG +
on-chain state, DO NOT re-run. Only re-run on explicit "gas/mint lagi".

## 3. Scatter.art API mint flow (FUWA worked example)

Scatter collections are minted via **mint lists**, not direct contract calls.

```
1. GET /v1/collection/{slug}/eligible-invite-lists?minterAddress=<wallet>
   → [{ id, root, address, name, currency_symbol, token_price,
        start_time, wallet_limit, unit_size }]
   (public list returned even without minterAddress)

2. POST /v1/mint  { collectionAddress, chainId, minterAddress,
                    lists: [{ id, quantity }] }
   → { mintTransaction: { to, value, data }, erc20s: [] }
   (backend generates the auth+signature — sign locally, broadcast)

3. Sign mintTransaction locally (PK never sent to API) → broadcast to chain.
```

Notes:
- `value` = quantity × token_price. Check `start_time` (may be future — mint not live).
- Scatter API (`api.scatter.art`) is NOT blocked by the Vercel checkpoint that
  blocks `www.scatter.art` — always probe the API host.
- Wallet limit per list (e.g. 10) — 5 wallets × 10 = 50 NFT was the proven run.
- After mint, verify via `tokensOfOwner(wallet)` on the NFT contract.

## 4. receive()-based free claim (Monkey worked example)

Some "mint" contracts use a plain `receive()` — sending 0 ETH triggers the claim:

```solidity
receive() external payable { if (launchActive) { _claim(); } }
function _claim() internal {
  require(msg.value == 0, "Only zero ETH claim");
  require(msg.sender == tx.origin, "Contract not allowed");
  require(!claimed[msg.sender], "Already claimed");
  require(balanceOf(address(this)) >= claimAmount, "Insufficient token");
  claimed[msg.sender] = true;
  _transfer(address(this), msg.sender, claimAmount);
}
```

To claim: `wallet.sendTransaction({ to: CONTRACT, value: 0, ... })` — no calldata,
just a 0-value transfer. 1x per wallet (`claimed` mapping). Check `claimed(addr)`
first, skip already-claimed wallets. This is the EASIEST mint class — no race,
no signature, gas ~$0.00002. Verify claimed mapping + balanceOf after.

## 5. Dual-RPC config (free + paid, no script edits to switch)

`rpc-config.js` reads `.env`:
```
primary = ALCHEMY_RPC_PAID || ALCHEMY_RPC_FREE || rpc.mainnet.chain.robinhood.com
backup  = RPC_BACKUP || rpc.mainnet.chain.robinhood.com
```
Scripts use `RPC_CONFIG.primary`. Upgrading to paid = edit one .env line, no code.
Keep the old-RPC script copies under `rpc-resmi-backup/` for A/B comparison.
Test ALL methods before trusting a new RPC — `eth_chainId` OK ≠ mint-capable
(drpc.org only supported chainId; eth_call/getBalance/sendRawTransaction failed).
