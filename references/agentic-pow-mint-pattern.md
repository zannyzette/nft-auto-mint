# Agentic PoW Mint Pattern (Neon Nodes reference)

Mints where the backend issues a puzzle, verifies the solve, returns an unsigned transaction, and co-signs on-chain. The NFT contract enforces a backend signature, so you cannot pre-build calldata — you must complete the API dance.

## Worked example: Neon Nodes (Robinhood chain, ID 4663)

- Contract: `0x[YOUR_WALLET_ADDRESS]` (ERC721SeaDropCloneable / eip1167 proxy)
- Supply 5,555 · mint price 0.00075 ETH · max 25/wallet · max batch 5/tx
- Skill file served at project domain: `https://neonnodes.xyz/skill.md` (read it — agentic projects publish their own skill.md with the full API spec)
- API base: `https://neonnodes.xyz/api` — endpoints: `/info`, `/check/{wallet}`, `/puzzle`, `/solve`, `/submit`, `/metadata/{id}`

## Flow (proven working)

```
POST /api/puzzle  {wallet, quantity?}     → {puzzleId, question, expiresAt}  (5 min expiry, 3 attempts)
POST /api/solve   {wallet, puzzleId, answer} → {unsignedTx: {to,data,value,chainId}, mintPrice, quantity}
   → sign locally (PK NEVER sent to server)
POST /api/submit  {signedTransaction}     → {success, tokenIds[], hash, remaining}
```

Puzzle types: arithmetic (add/sub/mul/div/mod/squares/half/double/three-term), decimal→hex 0-255, decimal→binary 0-63.

Batch mint: `quantity` 1..5 at `/puzzle` — ONE puzzle unlocks the whole batch; `value = quantity × mintPrice`; calldata targets `mintBatch(quantity, nonce, signature)`. Batch 5 uses ~60% less total gas than 5 singles.

## CRITICAL: Robinhood chain EIP-1559 fee handling

`provider.getFeeData()` on `rpc.mainnet.chain.robinhood.com` returned garbage that made `maxFeePerGas < maxPriorityFeePerGas` → signed tx reverted on-chain (`mint_reverted`). The project's own skill.md documents why hardcoding works:

- Base fee typically ~0.02 gwei, occasionally spikes to ~0.1 gwei
- Priority fee 0 (single sequencer, no MEV bidding)
- EIP-1559 refunds the difference between maxFeePerGas and effectiveGasPrice → generous ceiling is FREE

Working signer values (ethers v6):
```js
gasLimit: 220000,
maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
nonce: await provider.getTransactionCount(wallet.address),
type: 2,
```
Real cost per mint ≈ 0.00001-0.00002 ETH regardless of cap.

## Secure VPS layout (hot wallet)

```
neon-mint/
├── .env              chmod 600: PRIVATE_KEY=0x...  (+ optional COLD_WALLET=0x...)
├── neon-vps-signer.js  reads PK from .env, signs locally, prints signed tx hex
└── neon-sweep.js       transfers all NFTs (safeTransferFrom) + remaining ETH to COLD_WALLET
```

- PK never appears in chat/logs; signer reads it from .env at runtime
- Sweep leaves a small gas reserve (e.g. 0.00002 ETH) rather than draining to zero
- Sweep options: `--nft-only` / `--eth-only` so you can hold NFTs (flip) while sweeping ETH, or vice versa
- Test signer with a throwaway key `0x"11"*32` to validate the script path without touching the real wallet
- Mint-then-sweep (not sweep-inline) is fine: hot wallet is capped small anyway, sweep runs on demand

## Lessons from the live miss (sold out)

919 minted at research time → sold out (5,555) within hours. The fee bug cost one reverted tx; by the time we retried, supply was 0. Sequence matters: fix + validate the signer BEFORE the mint window, keep the wallet funded, and treat a hot mint as a race from the first puzzle request.

## .env validation (never print the key)
```python
import re
raw = open('.env','rb').read()
m = re.search(rb'^\s*PRIVATE_KEY\s*=\s*(.+)$', raw, re.M)
pk = m.group(1).strip()
assert len(pk) == 66 and pk.startswith(b'0x') and re.fullmatch(rb'[0-9a-fA-F]+', pk[2:])
assert b'"' not in pk and b"'" not in pk and b' ' not in pk and b'\r' not in pk
```
Common failure: stray leading char from paste (e.g. `xPRIVATE_KEY=`). Structure-check, don't display.

## PK leak audit
- `.env`: `-rw-------` (600); folder `drwx------` (700).
- Grep PK prefix (`pk[2:16]`) across `~/.bash_history`, `~/.hermes/logs`, `~/.hermes/sessions`, `/tmp`, `/var/log` — confirm zero hits.
- Never `cat .env`; never screenshot it; seed phrase never enters chat/logs at all.

## Reusable checklist for any agentic PoW mint

- [ ] Read the project's skill.md (if served) — it IS the API spec
- [ ] Check `/info` for supply/minted/remaining/mintActive
- [ ] Validate signer gas handling on the target chain BEFORE funding
- [ ] Confirm wallet balance ≥ quantity×price + gas
- [ ] Keep PK in .env chmod 600, signing local
- [ ] Sweep target (COLD_WALLET) configured in advance
- [ ] Hot mint = no dry-run delay: fire the real tx as soon as the test proves the path
