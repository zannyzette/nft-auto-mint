# pools.fun Token-Burn Mint — API Resmi (worked: Pool's Closed, 2026-08-16)

## Konteks
Mint NFT yang butuh burn token dari platform token-launch (pools.fun / pump.fun).
Pool's Closed Guards (1000 supply, burn 10,000 $CLOSED per Guard, Robinhood 4663).

## PELAJARAN UTAMA — pakai API resmi platform, JANGAN reverse-engineer router
- Token pools.fun = SushiSwap V3 pool di Robinhood.
- Router di tx swap (0xe01020e8...) punya fungsi custom `0x86ca0dc0` — reverse-engineer
  = 5x revert + 30 menit buang waktu.
- **Jalur bener: `https://api.bankr.bot/pools-fun/swap/quote`** (domain API pools.fun).

## Flow API resmi (terbukti jalan sekali coba)
```
POST /pools-fun/swap/quote
{
  "tokenAddress": "<CLOSED>",
  "side": "buy" | "sell",
  "amountIn": "<wei>",           // buy: ETH in; sell: token in
  "payWithNative": true,
  "slippageBps": 500,
  "recipient": "<wallet>"
}
→ {
  "amountOut": "...", "minAmountOut": "...",
  "tx": { "to": "<router>", "data": "0x...", "value": "0x0" },  // SIGN AS-IS
  "approval": { "to": "<token>", "data": "0x095ea7b3..." }      // kalau perlu approve router
}
```
- **JANGAN rebuild calldata** — sign tx dari API apa adanya (wrapper + embedded logic).
- Untuk sell: mungkin perlu `approval` dulu (approve token → router), sign approval lalu tx sell.

## Setelah dapet token
1. `approve(token, NFT_ADDRESS, cost)` — cost = price × qty
2. `NFT.mint(qty)` — burn token di dalam mint call
3. Verify totalSupply

## Script referensi
`/home/ubuntu/mint-wallets/pools-mint.js` — flow lengkap (quote → sign → broadcast → approve → mint).

## ⚠️ Catatan tambahan
- Sebelum beli token: intel supply dari operator (dia yang tau — jangan cek supply sendiri, operator bilang "kalau gw minta mint pasti masih ada").
- Kalau NFT sold out di tengah riset: jual balik token via API yang sama (side:"sell") — duit balik, untung dikit kalaupun harga naik.
- Error `0x52df9fe5` = ExceedsMaxSupply (sold out).
