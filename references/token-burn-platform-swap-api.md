# Token-Burn Mint: Platform Swap API + Supply-Check Pitfall (Pool's Closed, 2026-08-16)

Mint class: NFT paid in a **launch-platform token** (not ETH) — buy the token, approve, burn-mint.
Worked: Pool's Closed Guards (`poolsclosed.xyz`, Robinhood 4663). 10,000 `$CLOSED` per GUARD, max 1,000 supply.

## 🚨 PITFALL #1 — Cek SUPPLY DULU sebelum beli token (sold-out trap)

Pool's Closed: swap beli 104K `$CLOSED` SUKSES + approve SUKSES → `mint(3)` REVERT `0x52df9fe5` (ExceedsMaxSupply) karena **supply sudah 1000/1000** — NFT habis sebelum kita sempat mint. Duit token kepake sia-sia (~$6).

**Rule:** untuk token-burn mint, **baca `totalSupply()` vs `maxSupply()` di kontrak NFT SEBELUM beli burn-token**. Kalau sudah dekat cap (mis. 900+/1000) → kemungkinan abis duluan → laporkan & skip, atau konfirmasi operator. Jangan beli token dulu baru cek supply.

## 🚨 PITFALL #2 — Jangan reverse-engineer DEX router kalau platform punya swap API resmi

Awalnya gue coba swap manual via router custom (`0xe01020e8...`, fungsi `0x86ca0dc0`) — revert berkali-kali karena struktur argumen custom. **TERNYATA pools.fun (platform launch token) punya API swap publik yang langsung kasih tx siap-sign:**

```
POST https://api.bankr.bot/pools-fun/swap/quote
body: { tokenAddress, side: "buy", amountIn: "<wei>", payWithNative: true,
        slippageBps: 500, recipient: "<wallet>" }
→ { amountOut, minAmountOut, tx: { to, data } }   ← tx.data READY-TO-SIGN, jangan diubah
```

Flow lengkap yang TERBUKTI:
1. `POST /pools-fun/swap/quote` → `tx.to` + `tx.data` (sudah lengkap, gasLimit 600k)
2. `signTransaction({to: tx.to, data: tx.data, value: amountIn, chainId: 4663, ...GAS})` → broadcast → wait
3. `balanceOf` verify $CLOSED masuk
4. `approve(NFT, cost)` → `nft.mint(qty)` → verify `totalSupply`

## Cara nemu platform swap API (reusable)

1. Curiga: mint butuh token yang di-launch di platform (cek link "buy token" di situs mint → arah ke pools.fun / sejenis).
2. Grep JS situs platform untuk `swap/quote`, `swap/prepare`, `swap/execute`, `api.` → base URL (Pool's Closed: `https://api.bankr.bot`).
3. Body quote: cari `tokenAddress`, `side`, `amountIn`, `payWithNative`, `slippageBps`, `recipient` di JS.
4. Quote API balikin `{tx:{to,data}}` → sign apa adanya (jangan rebuild calldata) — sama kayak drops API.
5. Kalau platform gak punya API → baru coba DEX router (Uniswap/Sushi V3, cek pool via factory `getPool`, cari tx swap sukses terakhir buat decode router asli).

## Catatan lain

- Banyak token CLOSED palsu di DexScreener — verifikasi address token persis dari kontrak mint (`CLOSED()`/`token()` view atau ABI situs).
- Router swap `0x86ca0dc0` itu `execute(bytes,bytes[],uint256)` — bukan swap standar; jangan tebak-tebak struktur kalau platform punya API.
