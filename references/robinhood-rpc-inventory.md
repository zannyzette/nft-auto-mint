# Robinhood Chain — RPC Inventory & Findings

## 💳 dRPC paid tier (2026-08-12, verified from drpc.org pricing page)

Free tier = public shared node, 100 req/s, 210M CU/mo. **Growth tier = $6 per 1M requests, pay-as-you-go (no monthly subscription)**: high-performance dedicated nodes, 5K req/s, AI load balancer, 99.99% uptime. Enterprise = custom.
- **Why it matters for races:** BrokeCatss failed because ALL 3 free RPCs choked at T-0 (broadcast fetches hung ~7-8s, supply gone by recovery). A high-perf paid node (5K rps) is the flood-survival fix; free public nodes share capacity with every other bot.
- Friend's 3ms drpc endpoint (screenshot 2026-08) = almost certainly paid/private endpoint **+ US-located server** near dRPC/sequencer infra — 3ms is unreachable from SG at any tier (best SG RTT measured: Alchemy 76ms).
- Signup path: drpc.org → Connect (wallet/email) → Create Endpoint → chain Robinhood → free URL `https://robinhood.drpc.org`; upgrade to Growth → private endpoint URL with API key (that's the `.../AmwVXAQmSO`-style path seen in the wild).

## ⚡ 2026-08-12 MEASURED (from SG VPS, eth_blockNumber RTT)

| RPC | RTT | Verdict |
|-----|-----|---------|
| `https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp` (ALCHEMY_RPC_FREE) | **76-80ms** | ✅ **FASTEST, full support** — used all session for reads + broadcast |

## Chain physics (measured 2026-08-13 — governs ALL race design)
- **Block cadence ≈ 0.2s** (5 blocks/sec, gaps 0-1s). At this speed, poll-then-fire is inherently 3-4 blocks late — race scripts must fire on LOCAL clock with calibrated offset (see `seadrop-race-v3.js`), not on block-timestamp polling.
- **RPC origin**: `rpc.mainnet.chain.robinhood.com` → CNAME `customer-origin.offchainlabs.com` (Arbitrum/Offchain Labs) behind Cloudflare (Anycast — Toronto edge seen from SG). `drpc.org` and Alchemy are separate paths; a fast path to the sequencer beats everything else.
- **Gas price does NOT affect tx ordering** (single sequencer, FIFO arrival). Empirically proven: a winning whale minted at gasPrice 0.0275 gwei while we lost races with 7× higher priority fee. Raising maxFeePerGas only buys base-fee-spike insurance (ceiling is refunded) — use 0.5 gwei ceiling, never expect ordering benefits.
- **Gas LIMIT matters** (opposite of price): SeaDrop mints ≈ 34k gas/NFT (qty 10 ≈ 400-500k, qty 20 ≈ 700k+, Brokers raise qty 10 = 1.54M). Too-low gasLimit = silent revert. Generous fixed limit (1.2M) is correct for races — never estimateGas in the hot path.
- drpc.org measured 82ms but **sometimes fails entirely (99999)** under load — it's a fire-path extra, never the primary.
| `https://robinhood.drpc.org` | **82ms** | ⚠️ fast, broadcast fan-out OK; reads historically unreliable (chainId-only) — keep as fire-path only, never primary read |
| `https://rpc.mainnet.chain.robinhood.com` | **298-299ms** | ✅ canonical — full support, reliable, but ~4x slower than Alchemy |

## dRPC paid tier — flood-survival tool (2026-08, verified pricing from drpc.org)

Free tier = PUBLIC nodes only (100 req/s, shared) → exactly what choked at T-0 in the BrokeCatss failure (all 3 free RPCs hung on broadcast). Paid **Growth** tier: **$6 per 1M requests, pay-as-you-go (no monthly sub)**, high-performance/dedicated nodes, **5,000 req/s**, AI load balancer, 99.99% uptime. For a serious race bot the paid endpoint is worth it primarily as **flood survival** (broadcast goes through while free nodes hang), secondarily for lower latency.
- Setup: drpc.org → sign up → create endpoint (Robinhood chain) → upgrade to Growth → private endpoint URL with key.
- Observed: friend's dRPC endpoint displayed **3ms** (US-based server + likely paid node). From SG: free drpc ~82ms, and drpc intermittently fails RTT probes (reads as 99999) while still working as a broadcast path — keep it in fan-out, never as primary read.
- Latency ladder from SG VPS (measured live): Alchemy 76-91ms < drpc ~82ms < canonical 298-312ms. Alchemy is the primary read+broadcast path.
| `irpc.live/robinhood/<key>` (friend's endpoint) | **3ms (reported elsewhere)** | ⚠️ **unresolved from SG VPS (2026-08)** — DNS/connect fail; operator later clarified it is actually a **dRPC endpoint** (paid/private). If a contact shares a fast endpoint, get the exact URL and measure — sub-50ms RPC is the single biggest FCFS lever after geography. |

## dRPC paid tier (Growth) — flood survival at T-0

| Tier | Price | Nodes | RPS | Uptime |
|------|-------|-------|-----|--------|
| Free | $0 (210M CU/mo) | **public shared** | 100 | general |
| **Growth** | **$6 / 1M requests** (pay-as-you-go, no subscription) | **high-performance dedicated** | **5,000** | 99.99% |
| Enterprise | custom (300M+ req/mo) | dedicated | unlimited | SLA |

- Why it matters: the BrokeCatss loss was NOT latency — all 3 free RPCs **choked at T-0** (fetch hung 7-8s, no timeout). A paid dRPC node (5K rps, dedicated) survives the same flood. The friend's 3ms was paid node **+** US server proximity, not just the plan.
- Signup flow: drpc.org → Connect → Create Endpoint → chain Robinhood → free URL `https://robinhood.drpc.org`; upgrade to Growth in dashboard → private keyed URL (`.../<apikey>`).
- Caveat: paid node from SG VPS still won't be 3ms — it removes the flood choke, not the geography gap.

## Chain physics that decide race design

- **Block cadence ≈ 0.2s** (measured gap sampling: 1,0,0,0,0,...) → poll-then-fire is inherently 3-4 blocks late. Race scripts MUST fire on local clock with a calibrated offset (see `scripts/seadrop-race-v3.js`).
- RPC resolves to `customer-origin.offchainlabs.com` via Cloudflare (Offchain Labs = Arbitrum team, Brooklyn NY) — a US-East VPS is the only real latency fix left.
- **Measurement method**: RTT = `curl -w %{time_total}` on POST `eth_blockNumber`; geolocate via `dig +short <rpc>` → `ip-api.com/json/<ip>`; block cadence = sample last 10 block timestamps.

**Chain facts (measured):** block cadence ≈ **0.2s/blok** (5 blok/detik) — poll-then-fire is inherently 3-4 blocks late; race scripts must fire on LOCAL clock. RPC resolves to `customer-origin.offchainlabs.com` via Cloudflare (Toronto edge for SG; sequencer origin = Offchain Labs, Brooklyn NY). ETH/USD oracle available on-chain (`Window.ethUsd()`, 8 decimals) ≈ Coingecko.

**Gas does NOT determine FCFS order** — single sequencer FIFO by arrival, no gas auction. Proof: Toadlings whale won with gasPrice 0.0275 gwei while our txs lost with 7x higher priority fee. Raising maxFeePerGas only buys insurance against base-fee spikes (ceiling is refunded) — 0.5 gwei ceiling, 0.01 gwei priority is the standard.

## RPC yang VALID (full JSON-RPC, support mint/broadcast)

| RPC | Latency (SG) | Support | Notes |
|-----|-------------|---------|-------|
| `https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp` | **76-80ms** | FULL | ALCHEMY_RPC_FREE dari `.env` — **fastest, verified live (2026-08)**. Read + broadcast. |
| `https://rpc.mainnet.chain.robinhood.com` | ~300ms | FULL | RPC resmi — semua method OK. Default/canonical. |

## RPC yang GAGAL / TIDAK LENGKAP

| RPC | Problem |
|-----|---------|
| `robinhood.drpc.org` | ⚠️ Reads historically unreliable (eth_call/getBalance can fail; RTT probes intermittently time out reading as 99999) — but **eth_sendRawTransaction broadcast WORKS** (verified in v2/v3 race fan-outs 2026-08). Use as fire-path only, never primary read. |
| `robinhood-rpc.publicnode.com` | ✅ chainId OK tapi ~1.6s — lambat |

## dRPC paid tier (2026-08) — flood survival, not just latency

Free tier = public/shared nodes (100 req/s, ~210M CU/mo). **Growth = $6 per 1M requests, dedicated high-performance nodes, 5,000 req/s, pay-as-you-go (no monthly sub)**. The T-0 flood (every bot broadcasting at once) chokes free public nodes — that's the BrokeCatss failure mode (all 3 free RPCs hung, fetch no-timeout, +10s late). A dedicated Growth endpoint is the fix. Signup: drpc.org → Connect → Create Endpoint → Robinhood → upgrade. A friend's paid endpoint displayed 3ms — geography (US server) drives most of that, but flood-survival is the paid tier's real value. Keep free endpoints in fan-out; put the paid one first.

## Live measurements 2026-08-12 (SG VPS → Robinhood) — RACE-CRITICAL

- **Block cadence: ~0.2 detik/blok (5 blok/detik)** — VERIFIED (gap 0-1s). Konsekuensi: poll-then-fire SELALU telat 3-4 blok. Race harus fire berbasis **jam lokal terkalibrasi** + drip nonce, BUKAN poll block timestamp.
- RTT terukur: **Alchemy free 76-91ms (tercepat)** · drpc.org **82ms** · **canonical 298-312ms (PALING LAMBAT — jangan jadi polling/fire utama)**.
- `rpc.mainnet.chain.robinhood.com` resolve ke `customer-origin.offchainlabs.com` (Offchain Labs = tim Arbitrum) di belakang Cloudflare (edge Toronto buat SG) — sequencer secara fisik di US-East.
- **drpc paid tier** ("Growth"): **$6 per 1M requests, pay-as-you-go** (bukan langganan), high-performance/dedicated node, 5.000 rps, 99.99% uptime; free tier = public node, 100 rps. Buat drop hype (RPC kebanjiran pas T-0), paid node = survival kit. Cara: drpc.org → Connect → Create endpoint → Robinhood → upgrade Growth (endpoint private ber-key, kayak `.../AmwVXAQmSO`).
- Pemenang race sering punya latency ekstrem (contoh nyata: 3ms via drpc) = kombinasi **server US deket infra RPC + node dedicated**. Dari SG, Alchemy 76ms adalah floor praktis; gap fisik 1-2 blok di cadence 0.2s tetap ada — drip-fire + lead presisi menutup gap kode, bukan geografi.
| `rpc.rhinofi.io` / `rpc.rh.majesticrpc.io` / `robinhood.llamarpc.com` / `1rpc.io/robinhood` / `robinhood.publicnode.com` / `rpc.robinhood.gateway.fm` / `robinhood.chainstacklabs.com` / `robinhood-mainnet.public.blastapi.io` / `rh.drpc.org` / `api.rh.merkle.io` | ❌ dead/blocked |

## Pelajaran
- **Jangan ganti RPC tanpa test method lengkap dulu** — chainId OK ≠ bisa mint.
  Selalu test: eth_call, eth_getTransactionCount, eth_sendRawTransaction, eth_getTransactionReceipt.
- **Latency test yang bener** = test eth_call (read) + eth_sendRawTransaction (broadcast), bukan eth_chainId doang.
- RPC resmi Robinhood (~600ms dari SG) tetap yang paling bisa diandalkan untuk sekarang.
- Untuk race mode: fan-out broadcast ke multiple RPC sekaligus TAPI hanya yang verified full-support.
