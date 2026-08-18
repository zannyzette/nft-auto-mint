# Minting Logic — The Brain (distilled from Rentoids + Neon + research)

Bukan catatan project — ini POLA PIKIR yang reusable di mint mana pun.

## 1. Read the contract FIRST (15 menit, gak bisa dilewatin)

Sebelum mikir strategi, baca source code (Blockscout verified / Etherscan):
- **Mint function**: `mint()`, `publicMint()`, `mintSigned()`, `mintBatch()`
- **Price logic**: free lane (`msg.value == 0`) vs paid lane?
- **Per-wallet limit**: `WALLET_LIMIT`, `mintsPerWallet`
- **Per-window cap**: `FREE_PER_BLOCK` + `FREE_WINDOW` — GLOBAL atau PER-WALLET?
- **MAX_PER_TX**: batch size
- **Reveal/close logic**: `revealSeed`, `mintStart`, `lockRevealBlock`
- **Sweep**: `sweepUnminted` — sisa supply bisa diambil owner setelah T+24h

**Keputusan pertama setelah baca contract:**
```
Free mint per-wallet?      → loop biasa, gas murah, tinggal sabar
Free mint per-window GLOBAL → INI RACE — butuh tuning latency
Paid lane ada?             → jalur deterministik, tapi bayar
```

## 2. Klasifikasi Jenis Mint

| Jenis | Karakteristik | Strategi |
|-------|--------------|----------|
| **Public mint** | `publicMint()`, calldata bisa pre-build | Pre-sign + fire T-0 |
| **Allowlist (SeaDrop)** | `mintSigned()`, butuh signature server OpenSea | Reverse-engineer gql.opensea.io (blueprint Zun) |
| **Agentic PoW** | Puzzle → solve → sign → submit (Neon) | Ikutin skill.md project, solve cepet |
| **Free window global** | 1 slot / N detik, semua rebutan | Race mode + tuning (bawah) |
| **Free per-wallet** | Semua bisa mint, limit per wallet | Loop biasa, kuantitas |

## 3. Free-Window-Global Race — LOGIKA INTI

### Mekanika
```
FREE_WINDOW = 5s → slot reset tiap timestamp % 5 == 0
FREE_PER_BLOCK = 1 → cuma 1 pemenang per window
GLOBAL → semua bot rebutan 1 slot
```

### Kenapa bot dominan menang (hierarchy pengaruh):
```
1. LATENSI FISIK ke sequencer  ← 80% penentu
2. Timing presisi (fire pas/sblm boundary) ← 15%
3. Overhead kode (RPC calls) ← 5%
```

### Formula sweet spot (verified Jakarta, Robinhood):
```
fire_time = next_boundary - 165ms   (range aman: -155..-175ms)
fan-out   = broadcast tx ke SEMUA RPC hidup sekaligus
nonce     = pre-sign sekali per nonce (calldata konstan = mint(1))
```

### Kenapa -165ms, bukan -800:
- RPC relay butuh buffer gede (1.7s) → tembak -800ms
- Inject langsung (Alchemy/direct) → cuma butuh -165ms
- Fan-out centre -165ms = tx udah di antrian sequencer pas window flip

### Nonce management (bug terbesar multi-RPC):
- Selalu refresh nonce dari RPC CANONICAL setelah tiap fire
- drpc.org/secondary RPC bisa lag → "nonce too low"
- Sukses ATAU revert sama-sama konsumsi nonce → nonce++
- Desync handling: kalau error nonce → re-fetch state, jangan asumsi

### Realita win rate:
- Fair share (13 rival) = ~7.7% per window
- Dengan sweet spot + fan-out: ~25% (3.5x fair share)
- Tanpa tuning (naive loop): ~2-3%
- **Speed beats field size** — tuning > jumlah bot

## 4. Kapan Loop Berhenti (hard stop)

```
1. mintsPerWallet >= WALLET_LIMIT     → cap wallet
2. nextTokenId >= MAX_SUPPLY          → sold out
3. revealSeed != 0                    → mint closed (reveal)
4. mintStart == 0                     → belum buka
5. Balance < gas minimum               → stop biar gak stranded
6. RPC mulai 403                       → rate limited, throttle
```

## 5. Ekonomi Free Mint (kenapa worth)

```
Rentoids: 35 token free, floor 0.0015 ETH = ~$98, modal gas ~$4
ROI: ~25x

Kenapa: nonce & gas murah (Robinhood ~$0.0016/tx), token = tiket lotere
Floor real = value real, walau free.

ATURAN: free mint sehat + floor real → sprint dari menit pertama.
Jangan riset lama — mulai loop SEGERA, riset sambil jalan.
```

## 6. Pitfall yang Udah Kebayar (jangan ulang)

| Pitfall | Pelajaran |
|---------|-----------|
| Hammer 2x frekuensi | Gak ngaruh — masalah latensi, bukan frekuensi. Plus kena rate-limit |
| Lead 0/150/300 via 1 RPC | Gak cukup — butuh fan-out + sweet spot -165 |
| Gas estimate di hot path | Buang waktu — hardcode gas (Robinhood: 0.15/0.01 gwei) |
| Trust getFeeData() | Robinhood ngasih nilai kebalik — hardcode |
| Nonce desync multi-RPC | Selalu refresh dari canonical RPC |
| "Loop sampai supply abis" 1 wallet | Gak mungkin kalau ada cap 50 — butuh multi-wallet |
| Asumsi balance awal | Cek balance historis (eth_getBalance di block lama) — jangan nebak |

## 7. Checklist SEBELUM race (project baru)

- [ ] Contract kebaca? (mint fn, price, cap, window, reveal)
- [ ] Free per-wallet atau per-window global?
- [ ] Kalau global: VPS di mana? (Asia = kalah latency, jujur)
- [ ] RPC mana yang hidup? (fan-out list)
- [ ] Sweet spot: ukur dulu, mulai -165ms, adjust ±10ms
- [ ] Nonce refresh logic jalan?
- [ ] Hard stop criteria ke-set?
- [ ] Balance cukup buat gas (bukan buat mint)
- [ ] Floor/utility project sehat? (kalau iya → sprint)
