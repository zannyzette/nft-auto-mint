# Token-Burn Mint: Beli Token via API Resmi Platform (Pool's Closed 2026-08-16)

Mint class: NFT dibayar dengan **burn token** (mis. 10,000 $CLOSED per NFT), token di-launch
lewat platform token-launch (pools.fun, pump.fun, dsb). Kunci eksekusi: **jangan reverse-engineer
router swap** — platform punya API swap resmi yang kasih tx siap-sign.

## Alur Lengkap (terbukti Pool's Closed, wallet 2)

1. **Identifikasi token burn**: situs mint nyebut "minting costs N $TOKEN" → cari address token
   (situs/HTML/DexScreener). Cek `balanceOf` wallet — kalau 0, perlu beli.
2. **Cari API resmi platform**: token launch platform (pools.fun) punya API swap.
   - Base API: `https://api.bankr.bot` (domain backend pools.fun)
   - Endpoint quote: `POST /pools-fun/swap/quote`
   - Body: `{ tokenAddress, side: "buy", amountIn: "<wei>", payWithNative: true, slippageBps: 500, recipient }`
   - Response: `{ amountOut, minAmountOut, tx: { to, data } }` → **sign tx apa adanya** (jangan rebuild calldata)
   - `tx.value` kadang kosong → value = amountIn ETH yang dikirim
3. **Approve token → NFT contract** (kalau allowance < cost)
4. **mint(qty)** di NFT contract

## Cara Nemu API Platform (kalau gak diketahui)

1. Cari JS bundle situs (Vite/Next): `curl situs` → grep `src="...js"` → download
2. Grep pola API: `fetch(` / `"/api/` / `/swap/quote` / `api.bankr.bot` / domain backend
3. Cari fungsi helper: `swap/quote`, `swap/prepare`, `swap/execute` — flow 3 langkah khas
4. Test quote langsung dengan curl → kalau return `{tx: {to, data}}` → jalur resmi ketemu

## Pitfall: reverse-engineer router = buang waktu

- Router swap custom (mis. `0x86ca0dc0` di Pool's Closed) bisa revert 5x karena argumen
  dinamis (minOut, expectedOut, fee) — padahal API resmi sekali coba langsung jalan.
- Aturan (pitfall #16 SKILL.md): mint yg butuh beli token → cari API resmi platform DULU.

## Sell-back (kalau mint gagal/sold out)

- Quote `side: "sell"` dengan `amountIn` = balance token → sign tx → broadcast
- Perlu `approve(token → router)` dulu kalau allowance 0
- Pool's Closed: sell 104K CLOSED → 0.00454 ETH (balik modal + receh)

## Script Acuan
`/home/ubuntu/mint-wallets/pools-mint.js` — quote → approve → mint (ganti NFT/TOKEN/QTY per project).
