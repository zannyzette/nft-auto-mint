# Revoke Approvals After Every Project (operator requirement, 2026-08-15)

The operator was drained once by a site that looked safe, and now wants a hard rule:
**once we are done with a project, revoke every approval/allowance we granted.**

## Why it matters

Drain attacks don't need your private key — they abuse `approve()`/`setApprovalForAll()`
you signed. A contract you approved once can pull everything later. Revoke is cheap
on Robinhood (~$0.01/wallet gas).

## Reusable script

`scripts/revoke-approvals.js` (in this skill):

```bash
# ERC-20: cabut izin spender (allowance → 0)
node revoke-approvals.js --erc20 <tokenAddr> --spender <spenderAddr> --wallets 1-10
# NFT: cabut operator (setApprovalForAll → false)
node revoke-approvals.js --nft <nftAddr> --operator <opAddr> --wallets 1-10
# Audit dulu tanpa revoke
node revoke-approvals.js --audit --erc20 <token> --spender <addr> --wallets 1-10
```

Script reads `wallets.json`, signs per wallet, waits for receipt, verifies, skips
wallets already at 0/false. `--wallets` defaults to all 10.

## Worked example: Robinhood Brokers

The mint required `approve($BROKER → Undertaker, MAX_UINT)` — we approved unlimited
and never revoked. Audit months later showed `allowance = 2^256-1` on wallets 1-4
(still holding ~3.6 quadrillion $BROKER). Revoke set it to 0: 4 txs × ~24k gas
≈ $0.04 total. Verify after revoke by re-reading `allowance()` — must be 0 on
every wallet.

## Best practices

- Prefer **exact-amount approve** over MAX_UINT whenever the contract allows it.
- If the mint forces unlimited approve → **revoke immediately after the mint batch
  confirms** (not "later").
- Operator says "revoke" after finishing a project → run audit → revoke → verify →
  report "SEMUA BERSIH".
- Hygiene: after any `--erc20`/`--nft` mint that used approval, check
  `allowance()`/`isApprovedForAll()` for the spender before moving on.

## Related: operator fleet rule (2026-08-15)

- Wallet 1 & 2 were excluded from the Merge Cats race after the operator sold their
  cats ($40) — but for NEW projects the operator re-activated ALL 10 wallets
  ("mulai sekarang semua wallet lagi"). Only exclude wallets on explicit instruction
  per-project.
- Operator prefers fleet expansion via their own Rabby wallets (Mode A, paste PK
  one-by-one), not VPS-generated random wallets.
