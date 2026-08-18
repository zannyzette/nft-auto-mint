# Robinhood Chain — WETH canonical & unwrap

## WETH address (canonical)
`0x[YOUR_WALLET_ADDRESS]` — symbol "WETH", ~420K holders.
JANGAN pakai kandidat lain (wETH / Wrapped ETH / Wrapped Small ETH) — semua copy-an dengan <200 holders.
Cek canonical: Blockscout `GET /api/v2/tokens/{addr}` → holders_count paling gede = asli.

## Unwrap WETH → ETH (semua wallet)
- `WETH.withdraw(uint256 wad)` — nonpayable, bakar WETH → ETH balik ke wallet yang sama.
- Flow: `balanceOf(wallet)` scan → kalau > 0 → sim `withdraw(amount)` → broadcast.
- Gas ~150k, chainId 4663, maxFee 0.5 gwei / priority 0.01 gwei (standar RH).
- Idempoten: wallet dengan WETH 0 auto-skip → script bisa dijalankan ulang kapan pun.
- Script: `/home/ubuntu/mint-wallets/weth-unwrap.js` (verified 2026-08-17, 14/15 wallet unwrap 0.0228 WETH, wallet 13 = 0).
