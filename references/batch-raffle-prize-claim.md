# Batch-Raffle Prize Claim (MothBroker pattern)

Kontrak NFT dengan mekanik batch raffle: tiap batch X mint → 1 winner random dapat % dari pool mint (MothBroker: batch 100, 10% lucky pool = 0.0025 ETH/batch ≈ $4.7 @ ETH $1.9K).

## Cek pemenang + claim
```javascript
// ABI prizes = 5 field (JANGAN 6 — decode gagal "could not decode")
'function prizes(uint256) view returns (address winner, uint256 amount, uint256 deadline, bool claimed, bool swept)'
'function batchesSettled() view returns (uint256)'
'function claimPrize(uint256 batchNumber)' // nonpayable

// loop batches 1..batchesSettled, baca winner → cocokkan dengan address fleet
// kalau winner ∈ fleet → cek deadline (CLAIM_WINDOW 259200s = 72h) → claim PRIORITAS
// expired + unclaimed = bisa di-sweep siapa aja (sweepExpiredPrize) → claim CEPAT
```

## Fakta MothBroker (2026-08-17)
- Batch 12 winner = wallet 7 (0xa5E3...), 0.0025 ETH, claimed 2026-08-17 via claimPrize(12) — TX sukses, balance naik.
- Semua prize 0.0025 ETH konsisten (10% × 100 mint × 0.00025).
- Claim window 72h; kalau lewat & gak di-claim → swept ke pool.
- Site FAQ: "Every batch of 100 mints, the contract randomly selects one minter from that batch to win the 10% Lucky Pool (0.0025 ETH)."

## Pelajaran
- Cek prizes() tiap project batch-raffle setelah mint — sering ada yang belum di-claim.
- ABI tuple field count harus EXACT dari verified ABI (5, bukan 6).

## Verifikasi token ID → batch (fleet)
- Alchemy free tier eth_getLogs cuma 10-block → JANGAN scan range besar.
- Cara bener: hash tx mint ada di log script (`grep -oP '0x[0-9a-f]{64}' <mint-log> | sort -u`) → `getTransactionReceipt` tiap hash → parse event `Transfer(from=0x0)` di log receipt → `tokenId = topics[3]` → `batch = floor((tokenId-1)/batchSize)+1`.
- GOTCHA: lowercase KEDUA sisi address — `l.address.toLowerCase() === CA` (CA const uppercase) gak pernah match → hasil palsu "0 mint events". Selalu `CA.toLowerCase()`.
- Hasil MothBroker (2026-08-17): 45 mint fleet → batch 12 (30 ticket, 30% odds — MENANG wallet 7) & batch 21 (15 ticket — kalah). Expected wins 0.45, realita 1 win = di atas EV, lucky.
- Blockscout `/tokens/{h}/transfers` & `/addresses/{h}/token-transfers` sering 422 — jangan buang waktu, receipt-decode aja.
