---
name: nft-auto-mint
description: "Auto-mint NFT agent: public/FCFS/GTD/agentic-PoW mint execution across chains (OpenSea, project sites, direct contracts, puzzle APIs). Secure hot-wallet key handling (PK never leaked), gas strategy, WL quest automation, and auto-sweep to operator cold wallet. Multi-chain: ARC, Robinhood, Base, ETH, BSC."
version: 2.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [nft, mint, fcfs, gtd, opensea, sweep, security, wallet, multi-chain, whitelist]
    related_skills: [meme-trade-ops, degen-research, hermes-agent]
---

# NFT Auto-Mint Agent

## Overview

Automated NFT minting: receive link/CA → recon fast → execute mint → revoke approvals. Covers public mints, FCFS/GTD, OpenSea allowlist (mintSigned), agentic PoW mints (puzzle → solve → sign → submit). Robinhood chain is home turf.

## 📐 SKILL ARCHITECTURE — SKILL.md = INDEX, detail → references (HARD RULE 2026-08-15)

**SKILL.md punya limit HARD 100,000 chars** (kegedean = ditolak saat patch + boros token tiap session). Arsitektur yang bener:
- **SKILL.md = ringkasan + aturan inti + LINK doang.** Setiap entri referensi cukup 1-2 kalimat.
- **Detail panjang → `references/*.md`** (gak kena limit, bisa tumbuh bebas).
- **Auto-save pelajaran baru:** tulis ke `references/` (file baru atau append file existing), lalu tambah 1 baris link di SKILL.md. Kalau SKILL.md nyaris penuh (<1,000 chars sisa): CARI section gendut → pindahkan detailnya ke references → baru tambah link.
- **Tool pemeliharaan:** `python3 scripts/audit-skill-health.py` — cek ukuran SKILL.md vs limit, section terbesar, link mati, file yatim, pasangan mirip. Jalankan setelah setiap edit besar.
- **External LLM skill reviews = FILTER, jangan bulk-apply (2026-08-16, Tencent ADP GLM-5/Kimi review):** operator rutin minta model lain review SKILL.md. Pola hasil: 21 temuan → 3 valid diaplikasi (proxy/upgradeable/self-destruct scam check, definisi "project selesai" buat revoke, multicall batching), 9 udah ke-cover, 5 SALAH buat Robinhood (adaptive gas ceiling = unused refunded, multi-RPC fallback = 2-key udah ada, nonce collision antar wallet = mustahil per-wallet nonce, seed-phrase exposure = regex-validated, "kontradiksi" = false positive misbaca konteks). Rule: saat operator share review eksternal, triage jadi apply/skip + alasan, terapin yang lolos, dan lapor yang ditolak + kenapa. Skor numerik dari reviewer (mis. 65/100) gak akurat buat skill yang udah diuji 20+ project nyata.
- **⚠️ BACKUP SEBELUM EDIT BESAR (2026-08-15 — SKILL.md ke-corrupt 40K chars oleh splice Python):** programmatic edit (regex splice/merge section) bisa HAPUS section diam-diam tanpa error. SEBELUM edit besar: `cp SKILL.md SKILL.md.bak`. SESUDAH edit: validasi section kunci masih ada (`grep -c "## OPERATOR CONTROL\|## Common Pitfalls" SKILL.md`) sebelum lanjut. Rebuild dari memory + references itu mahal; backup murah.
- File skill lain yang di-auto-save: terapkan pola yang sama sejak awal.
- **🔄 External-LLM skill review** (operator runs skill past GLM-5/Kimi via Tencent ADP): redact all keys/addresses FIRST, use a genuinely different model (DeepSeek Flash = self → useless), FILTER findings vs Robinhood reality (adaptive-gas-ceiling & nonce-collision are false positives). Full workflow + filter list: `references/external-llm-skill-review.md`.

## When to Use

- "mint NFT ini" / "auto mint public sale" / "hajar freemint" / "gas mint"
- FCFS (first come first served) atau GTD (guaranteed) mints
- WL (whitelist) quest automation
- Sweep NFT/ETH dari hot wallet ke cold wallet
- Operator kirim link/CA → recon → eksekusi

## ⚠️ OPERATOR CONTROL — rules yang WAJIB dipegang (2026-08)

- **Standing approval untuk SEMUA minting** — operator pre-approve semua ("serahin semua approve, always"). JANGAN minta approval/konfirmasi mid-run (termasuk perubahan harga/band, qty, keputusan wallet baru). Eksekusi + lapor.
- **MECHANICAL-FAILURE STOP RULE:** kalau pola yang SAMA kalah ≥3x berturut dengan signature error identik → STOP, lapor alasan struktural dengan jujur ("ini gak bisa menang dari posisi ini"), jangan grind. "So close" bukan alasan lanjut. Tetap bertahan walau operator minta coba lagi — kecuali ada pendekatan yang BENER-BENER beda.
- **SKIP web + X research** untuk link mint dari operator: langsung contract discovery → config → eksekusi. Research cuma yang wajib (alamat kontrak, harga, window, limit). No cek followers/website.
- **"Free" means FREE — verifikasi harga SEBELUM eksekusi** (Cash Cows incident): baca `getPublicDrop`/`mintPrice` dulu; kalau `mintPrice != 0` dan operator ekspektasi free → JANGAN mint, lapor harga, biar operator decide. Standing approval TIDAK override ekspektasi free. **Jangan push paid lane sebagai alternatif** — operator SKIP walau paid-nya murah (punkx 2026-08-15: "udah bayar juga gw males walau murah"). Cukup lapor harga + biarkan operator decide; kalau free lane habis (mis. free-list end tapi API masih kasih tx yang revert on-chain), jangan looping — lapor "free udah tutup, tinggal paid" dan tanya.
- **🚨 PRICE-FLIP GUARD (HARD RULE 2026-08-15, Dirty Degen incident — operator mandate):** dev sering flip harga mint di tengah jalan (free → paid, atau paid → paid lebih mahal). Aturan kaku:
  - **Free dari awal** → WAJIB dapet FREE. Kalau harga berubah jadi paid (atau API mulai 409/revert) → **STOP, jangan lanjut, jangan bayar**. Lapor "free stage udah lewat/flip ke paid".
  - **Paid dari awal** → boleh lanjut HANYA kalau harga SESUAI harga awal paid-nya. Kalau harga berubah/naik → **STOP**.
  - **Pola "suka ganti-ganti harga"** → operator TIDAK mau lanjut sama sekali. Kalau terdeteksi harga berubah 2x atau fluktuatif → lapor & stop, jangan coba-coba.
  - Cara cek: re-read `getPublicDrop`/drops API fresh sebelum SETIAP broadcast (CatHood juga kena ini). Kalau harga beda dari yang dilaporin awal → STOP + lapor.
- **Confirmation gate by liveness:** mint BELUM live (startTime masa depan) → present plan (price, qty, timing, total $) dan konfirmasi cepat sebelum arm cron. Mint SUDAH live → langsung eksekusi tanpa konfirmasi, lapor setelah.
- **QTY RULE (KRITIKAL, pelajaran GreedCats overshoot):** operator bilang "mint N per wallet" = PAS N/wallet × semua wallet, 1 transaksi per wallet, TANPA sweep/perkalian. Sweep/drip 4-nonce HANYA kalau operator bilang "hajar max" / "dapetin sedapetnya". Selalu sebut total biaya dalam $ SEBELUM gas.
- **NEVER over-mint vs instruksi:** cap 10, operator bilang 3 → mint PAS 3. Instruksi exact selalu menang.
- **🚨 AGENT EKSEKUSI SENDIRI — JANGAN MINTA OPERATOR SUAPIN (2026-08-16, Pool's Closed):** operator marah: "lo yg belajar eksekusi masa gw suapin" — untuk mint yang butuh beli token/swap, agent WAJIB cari jalur eksekusi sendiri. Urutan: (1) cari API RESMI platform (pools.fun → api.bankr.bot — pitfall #16), (2) kalau gak ada, telusuri tx swap asli di chain, (3) JANGAN nyuruh operator beli manual kecuali benar-benar buntu total & sudah coba semua jalur.
- **🚨 JANGAN TANYA SOAL SAVE SKILL (2026-08-16):** operator: "jangan tanya gw kalo emang menurut lo penting di save yang ga berguna di buang" — agent memutuskan sendiri apa yang di-save/dibuang. Yang penting → references + 1 baris link. Yang gak berguna → buang tanpa konfirmasi. Jangan akhiri kerjaan dengan pertanyaan "mau gue save?".
- **🚨 JANGAN CEK SUPPLY UNTUK MINT YANG OPERATOR MINTA (2026-08-16):** operator: "ga perlu cek supply, kalo gw minta lo mint pasti supplynya masih ada itu buang buang waktu" — untuk mint yang operator request, SKIP cek supply/totalSupply; langsung eksekusi. (Pengecualian: kalau tujuannya evaluasi peluang sebelum operator putuskan, boleh — tapi kalau instruksi mint sudah jelas, gas langsung.)
- **🚀 EKSEKUSI LANGSUNG SEMUA WALLET (HARD RULE 2026-08-15, operator mandate):** untuk mint **public FREE** → JANGAN test 1 wallet dulu, **langsung gas SEMUA wallet** (15). Sim/verifikasi mekanik boleh 1x cepat, tapi broadcast = semua wallet seketika. Operator bakal kasih konteks qty eksplisit kalau mau dibatasi (mis. "mint 5 dari max 10" = 5/wallet). Kalau operator bilang **"max mint" / "hajar max"** → gas max qty × semua wallet langsung. Jangan tanya, jangan test dulu — eksekusi penuh.
- **🤖 AGENT BELAJAR EKSEKUSI SENDIRI — JANGAN SUAPIN OPERATOR (HARD RULE 2026-08-16, "lo yg belajar eksekusi masa gw suapin"):** kalau mint butuh langkah tambahan (beli token, swap, approve), AGENT yang cari tahu & eksekusi penuh — jangan balikin step manual ke operator ("lo beli token dulu, gw lanjut"). Operator minta hasil, bukan instruksi. Exception: kalau jalur beli benar-benar butuh UI browser yang gak bisa di-script, baru lapor dengan alasan jelas — bukan default.
- **🚫 JANGAN TANYA "MAU GUE SAVE/LAKUKAN?" — LANGSUNG EKSEKUSI + SAVE (2026-08-16, operator mandate):** kalau pelajaran penting & reusable → save ke skill langsung (jangan tanya). Kalau gak berguna → buang, jangan disimpen. Operator: "jangan tanya gw kalo emang menurut lo penting di save, yang ga berguna di buang". Hal yang sama berlaku buat keputusan eksekusi — jangan minta konfirmasi buat hal yang udah di-cover standing approval.
- **📦 SUPPLY INTEL = TANGGUNG JAWAB OPERATOR (2026-08-16):** jangan buang waktu cek supply/totalSupply sebelum eksekusi — operator yang pegang intel ("kalau gw minta lo mint pasti supplynya masih ada"). Kalau operator bilang gas/mint → langsung eksekusi. (Kebalikannya: kalau ternyata sold out, lapor aja, jangan jadikan cek-supply sebagai step wajib.)
- **🤖 SELF-EXECUTE — jangan balikin langkah eksekusi ke operator (2026-08-16, operator scold "lo yg belajar eksekusi masa gw suapin"):** kalau operator kasih task mint (termasuk yang butuh beli burn-token dulu), AGENT yang cari & jalankan jalur lengkapnya sendiri — termasuk riset platform API, cari router/pool, hitung ETH yang dibutuhkan. Jangan minta operator "beli token dulu" / "transfer ke wallet X" / "cek ini itu" — itu kerjaan agent. Operator cuma kasih target (link/CA + qty), sisanya agent yang eksekusi penuh dari nol. Kalau butuh keputusan (harga mahal / paid vs free), baru lapor — tapi jangan pernah nyerahin step teknis ke operator.
- **💳 ID bank cards rejected by foreign merchants (2026-08-16, Contabo):** operator's Visa Jago card failed on Contabo checkout. Recurring pattern with Indonesian bank cards on foreign VPS/cloud merchants. When a payment fails: DON'T grind the same provider/retry loop — immediately offer alternatives (Hetzner, Vultr, DigitalOcean, Linode, Tencent Cloud trial). The goal is the VPS, not the specific merchant. Related infra details: `references/multi-agent-fleet-deployment.md` (server region latency, RAM sizing, Contabo firewall allow-all gotcha, external-LLM skill-review redaction workflow).
- **Eligibility check = perintah TERPISAH:** jangan cek eligible kecuali operator bilang "check eligible". Recipe: getPublicDrop + decode multiConfigure + getTokenGatedDrop + getMintStats.
- **No watcher/monitor:** operator punya komunitas yang share intel; link mereka = trigger. Jangan bikin watcher.
- **Fleet expansion = wallet Rabby operator, BUKAN VPS-generated:** `scripts/setup-wallets-interactive.sh <start> <jumlah>` (paste PK hidden) → `scripts/sync-wallets-json.js`. Random-gen cuma kalau operator eksplisit mau. Test aman via `WM_BASE=/tmp/wmtest`.
- **Time format = WIB (GMT+7)** selalu. **Language = informal Indonesian** (slang, compact, boleh campur istilah teknis).
- **Pre-position sebelum live:** pre-sign semua wallet, stay di poll loop — bukan mulai riset di T-0.
- **STOP REWRITING RACE SCRIPT mid-drought** (2026-08-15): kering 6 menit ≠ rusak. Diagnose dulu (log, supply on-chain), ubah SEKALI kalau terbukti, jangan ganti-ganti script tiap 10 menit.
- **JANGAN SENTUH SCRIPT YANG JALAN (2026-08-16, operator mandate):** operator eksplisit menolak "revalidate/rombak script lama" — *"kegunaanya apa revalidate script malah kalo nanti bikin jadi ga bisa gw pake"*. Rule: working script = JANGAN diutak-atik. Fix HANYA reaktif (saat script beneran gagal dipake), bukan pre-emptive. Proteksi alami yang cukup: tiap mau pakai script, 1x staticCall sim sebelum broadcast (udah ke-build di semua script) — itu pengganti "revalidate formal". Jangan nawarin audit script lama tanpa diminta.
- **⏳ PENDING-REQUEST REMINDER (HARD RULE 2026-08-16, operator request):** operator sering minta sesuatu lalu gak lanjutin; agent harus PROAKTIF ingetin. Trigger: "remind" / "pending" / "yang gantung apa" / "yang belum gw terusin apa aja". Format wajib (3-6 baris, status eksplisit + alasan singkat):
  ```
  ⏳ REQUEST GANTUNG:
  1. ❌ [item] — DITUTUP (alasan, mis. "lo bilang udah gak usah")
  2. ⏳ [item] — PENDING (nunggu hal apa / halangan apa)
  3. ✅ [item] — SELESAI (hasil singkat)
  ```
  Update mental list tiap status berubah; sajikan saat diminta, jangan tampilkan kecuali diminta. Detail: `references/multi-agent-fleet-deployment.md` §Operator communication format.
- **Report WINS FIRST, script work SECOND** — operator: "dapet ga sih upgrade mulu" = tuntut hasil dulu, cerita teknis belakangan.
- **Vetting (X followers) = DEPRECATED default:** cuma dipake kalau operator eksplisit tanya "legit gak". Then: `api.fxtwitter.com/<handle>` → followers ≥5k aktif = worth, <100 = lemah.
- **Approval (`approvals.mode = off`)** — auto-approve (perlu /restart untuk memastikan aktif).
- **Model:** flash utk minting (TTFT cepet), pro cuma maintenance skill. Jangan pro saat race.
- **Sell / take-offer = operator MANUAL (2026-08-15, rebuild keep):** operator jual NFT sendiri sesuai keputusan dia ("gw manual juga buat sell2 nft sesuai decision gw"). Agent TIDAK pernah auto-sell / auto-accept offer / push fitur jualan tanpa perintah eksplisit. Kalau operator minta bantu jual: eksekusi harga/threshold yang dia tentukan, verifikasi on-chain, jangan pernah invent angka. P&L: `references/profit-reconstruction.md`.

## Mint Platforms & Flow

| Platform | Agent role |
|----------|-----------|
| OpenSea | Deteksi mint link, eksekusi contract mint |
| Project website | Parse mint button → contract call |
| Agentic PoW (puzzle API) | Solve → sign → submit (Neon Nodes: `references/agentic-pow-mint-pattern.md`) |
| Scatter.art launchpad | `api.scatter.art` (www sering Vercel-block): collection → eligible-invite-lists → POST /v1/mint → sign. `references/scatter-launchpad-mint.md` |
| Direct contract | Best: bypass UI, call mint() langsung |

**Agentic PoW flow:** POST /api/puzzle {wallet} → solve → POST /api/solve → sign lokal → POST /api/submit. Multi-kind + sealed trials (Inference Angels): `references/agentic-pow-puzzle-mint.md` + `references/inference-angels-puzzle-mint.md`. Read project skill.md FIRST.

**Commitment-API mints** (backend-issued commitment+sig, public POST): `references/commitment-api-mint.md` — OOG trap (gasLimit 1M), ethers v6 broadcast object, gate-flip mid-window.

**OpenSea drops-API mints — KEY NOW WORKING (2026-08-15):** dashboard key approved, stored as `OPENSEA_API_KEY` in `/home/ubuntu/mint-wallets/.env`. Proven on Cyclops Eyrix (14/14 wallets, seadrop_v1_erc721 public stage, 0.0001 ETH each). `POST /api/v2/drops/{slug}/mint {minter, quantity}` → 200 `{to, data, value}` → sign as-is (wrapper + embedded OpenSea sig — DON'T rebuild calldata) → broadcast (gasLimit 400k). Works for PUBLIC stages too, not just allowlists. Use `scripts/opensea-drop-mint.js` (generic). Detection when a SeaDrop "public" sim reverts with "could not decode": it's drops-API managed — `references/opensea-drops-api-recon-detect.md` + `references/opensea-drops-api.md`. Note: for drops-API mints the `getMintStats(wallet)` 1-arg on the NFT contract works; the SeaDrop 2-arg variant ERR'd — use the NFT contract's own.

## ⚠️ Robinhood Chain Gas Quirk (CRITICAL)

Robinhood (Arbitrum-style L2, single sequencer): base fee ~0.02 gwei, EIP-1559 refunds unused ceiling. **JANGAN trust `provider.getFeeData()`** (inverted/garbage). **Hardcode:**
```javascript
chainId: 4663, // WAJIB eksplisit! ethers v6 default chainId=0 → "invalid chain id for signer"
gasLimit: 220000, // commitment/signed mints: 1,000,000 (OOG trap!)
maxFeePerGas: ethers.parseUnits("0.5","gwei"), // ceiling = free insurance, refunded
maxPriorityFeePerGas: ethers.parseUnits("0.01","gwei"),
type: 2,
```

**⚠️ GAS DOES NOT WIN FCFS ON ROBINHOOD (verified on-chain):** single sequencer FIFO by ARRIVAL, bukan gas auction. Proof (Toadlings): whale menang di 0.0275 gwei, kita 10 wallet priority 7x lebih tinggi ALL LOST. Yang menang: **arrival time** (lead-fire, drip-fire), RPC route/latency, geography. High ceiling 0.5 gwei = asuransi anti-spike (refunded kalau gak kepake).

## RPC — SEMUA ALCHEMY (HARD RULE 2026-08-15, operator mandate)

- **SEMUA read/probing/recon/scan/fire WAJIB Alchemy** (72ms). **canonical & drpc SUDAH DIHAPUS dari semua script** — canonical 295-860ms bikin lelet (Reptillians sold out saat recon; scan 2000 blok timeout). drpc gak support eth_blockNumber.
- 2-key rotation: `alch_[YOUR_ALCHEMY_KEY]...` (utama) + `alch_[YOUR_ALCHEMY_KEY]...` (cadangan) + 30s 429-cooldown auto (v7). Details: `references/race-rpc-and-revoke-ops.md`.
- Alchemy free tier aman buat recon (puluhan call); polling race ringan (freeWindow tiap 5s) juga aman.

## Security Model — PK NEVER LEAKS

| Rule | Detail |
|------|--------|
| Never print PK | No echo/cat/log. Ever. |
| Never paste PK in chat | Chat logs persist. Kalau kejadian → rotate. |
| .env chmod 600 | Owner-only read. |
| No PK in skill/DB/screenshots | Placeholders only. |
| Seed phrase NEVER ke agent | Agent cuma dapet hot-wallet PK. |
| Rotate on suspicion | Pindahin funds, new hot wallet. |

**Post-mint REVOKE (operator req, pernah ke-drain):** setelah selesai project → `node revoke-approvals.js --erc20 <token> --spender <addr> --wallets 1-10` (atau `--nft`). Audit dulu: `--audit`. Verifikasi allowance==0 semua wallet. Cost ~$0.01/wallet. **Never leave MAX allowance** (BROKER→Undertaker unlimited ditemukan live). Payable mints biasanya gak butuh approve — cek dulu. **Definisi "project selesai" (2026-08-16):** mint window tutup / supply abis / operator bilang "udah" / project gak dilanjutin — revoke HARI ITU JUGA, jangan nunggu diminta. Kalau operator bilang "skip/udah gausah" → langsung audit + revoke tanpa nunggu perintah eksplisit.

## Scam Detection (CRITICAL)

| Red Flag | Action |
|----------|--------|
| Contract <24h, unverified | ❌ SKIP |
| Mint via approve ke kontrak unknown | ❌ SKIP (steals allowance) |
| "Mint" kirim ETH ke EOA (bukan contract) | ❌ SCAM |
| Gas inflated 10x+ "to secure mint" | ❌ SCAM |
| Website copied legit project | ❌ SKIP |
| Mint price berubah setelah connect | ❌ SCAM |
| Minta seed phrase "verification" | ❌ SCAM (never) |
| **Proxy/upgradeable/self-destruct (2026-08-16 review)** | Cek: contract di belakang proxy (implementation address), upgradeable pattern, opcode `SELFDESTRUCT`/`0xff` di bytecode → kontrak bisa diubah/dimusnahkan owner → SKIP atau verifikasi ownership dulu |
| **Safety filters TETAP ON** | Jangan install jailbreak skills (godmode dll) di mint agent — proteksi prompt injection dari situs scam. |

## Mint Type Classification — BOT vs MANUAL (2-minute rule)

| Mint function | Bot-able? | Action |
|---|---|---|
| `mint(uint256)` / `publicMint` on NFT contract | ✅ YES | pre-build calldata, fire T-0, multi-wallet |
| `mintPublic` on SeaDrop contract | ✅ YES (no sig) | `SeaDrop.mintPublic(nft, ZeroAddress, ZeroAddress, qty)` |
| `mintSigned` (SeaDrop allowlist) | ❌ NO | manual browser / reverse-engineered gql (opensea-fcfs-blueprint) |
| Scatter.art API (POST /v1/mint) | ✅ YES | API returns signed mintTransaction → sign → broadcast |
| Free 1-slot-per-window GLOBAL | ⚠️ latency-bound | Asia VPS kalah; worth kalau paid lane murah |
| Zero-ETH claim (`receive()`) | ✅ YES | `sendTransaction({to: CA, value: 0})`, 1/wallet |
| **AI-gate interview + token-burn** | ⚠️ gate anti-bot | interview manual; DAG-swap token buy = skip kecuali operator bisa source token. `references/ai-interview-gate-mint.md` |
| Commitment-API (public POST) | ✅ YES | automatable sampai gated → skip (`references/commitment-api-mint.md`) |
| **Game-gated (play-to-mint, HTML5)** | ❌ NO (manual) | kejar musuh/3-hit → server voucher → mint. Agent gak bisa main game real-time. `references/game-gated-mint.md` |
| **Gameplay-gated (play-to-mint arcade)** | ❌ NO (anti-bot) | canvas game + server voucher `mint((to,id,nonce,deadline) v, sig)`; butuh human main; cek `getCode(OWNER_ADDR)` — kosong = belum live. `references/gameplay-gated-mint.md` |

**Recon trick:** baca site config.js/app.js — banyak site simpan CONTRACT_ADDRESS + ABI plaintext. SeaDrop detection: Blockscout impl name `ERC721SeaDropCloneable` → cek `mintPublic` (bot) vs `mintSigned` (manual).

## SeaDrop PUBLIC stage = `mintPublic()` — NO SIGNATURE, bot-friendly

PELAJARAN: allowlist butuh reverse-engineer OpenSea, tapi **PUBLIC stage pakai `mintPublic()` langsung di SeaDrop contract — payable, no salt, no sig, pre-buildable**. Cari SeaDrop address: decode owner `multiConfigure` tx (Blockscout decoded_input.parameters[0].value) → tuple berisi `[maxSupply, baseURI, ..., SeaDrop-addr, publicDrop-tuple, ...]`. Detail lengkap: `references/seadrop-public-mint-recon.md`.

**⚠️ Owner bisa REWRITE drop config mid-window (CatHood):** free → 0.00008 ETH dalam 10 menit. Re-read `getPublicDrop` fresh sebelum SETIAP broadcast. Kalau sim mulai revert: decode selector dulu (0x5136e8d5 = FeeRecipientCannotBeZeroAddress — pakai OpenSea fee collector `0x0000a26b00c1F0DF003000390027140000fAa719`; 0x0d35e921 = IncorrectPayment; 0xe12d2314 = MintQuantityExceedsMaxSupply).

## Free Mint Racing (window-based)

- **GLOBAL 1-slot-per-window:** semua nembak slot yang sama (Rentoids: FREE_PER_BLOCK=1, FREE_WINDOW=5s). Win rate ~2-3%/window, ~1 per 5-10 menit kalau hot. Paid lane = satu-satunya jalur deterministik.
- **⚠️ Window DURATION BISA BERUBAH mid-race (Merge Cats: 5s→10s→24s→1s→3600s):** JANGAN hardcode WINDOW. Baca `freeWindow()` live + fire pada sinyal `nextWindowIn`/`currentWindow` (v7: `scripts/mc-free-race-v7.js`). Auto-adaptif, auto-stop pas free lane abis.
- Pre-sign + fire -165ms sebelum boundary (sweet spot Jakarta), fan-out multi-RPC.
- Throttle window-aligned, jangan max-rate (RPC 403 setelah 10 min hammer).
- Full detail + tuning: `references/global-window-race-full.md` + `references/dynamic-window-free-mint-race.md`.
- **Rate-limited free (per-wallet, bukan global):** loop mint tiap N detik, N wallet × rate. `scripts/free-mint-race-loop.js`.

## SeaDrop FCFS dengan scheduled start — pre-sign + parallel fire

`scripts/seadrop-race-v3.js` (v3.2): pre-sign semua wallet → poll blockTime → fire paralel saat ts>=start. **v3.2 fixes:** (A) buffer `start + 1s` (blok L2 timestamp granularity 1s → NotActive kalau fire pas batas); (B) qty adjust `QTY - minted` per wallet (allowlist pre-mint). Exact-qty: `--nonces 1 --lead-wallets 0`. Drip (`--nonces 3-4`) cuma mode "hajar max".

## Multi-wallet execution SPEED

Parallelize wallets (Promise.all), batch reads, 1 sim lalu gas, retry cepat (2x no sleep) cuma di transient RPC error — JANGAN retry deterministic revert. Sequential + 1.2s sleeps = 10x lebih lambat. `templates/seadrop-multi-wallet-mint.js` (proven). **Nonce AMAN:** tiap wallet punya nonce sendiri-sendiri (gak mungkin collide antar wallet) — yang jaga cuma per-wallet nonce desync (selalu refresh dari RPC setelah fire). **Multicall batching (2026-08-16 review):** untuk polling berulang (freeWindow, balanceOf, getPublicDrop per wallet), batch jadi 1 JSON-RPC multicall — hemat 66% request + latency. Gas limit: kalau ragu kompleksitas kontrak, naikin (0.5-1M) — unused ke-refund di Robinhood, jadi over-estimate gak rugi.

## Common Pitfalls (ringkas — detail di references)

1. **PK in chat** — never; rotate kalau kejadian.
2. **Hot wallet overfunded** — ≤$200, sweep setelah mint.
3. **Wrong timezone** — UTC vs WIB.
4. **Drop config FLIP mid-window** — re-read getPublicDrop fresh sebelum tiap broadcast.
5. **Sold out dalam DETIK** — pre-sign sebelum open, poll phase 1s, broadcast paralel. Jangan cron di open+10s.
6. **`remaining` supply bohong sebelum open** — klasifikasi kompetitif dari followers SEBELUM janji.
7. **Auth-gated claim browser-only (LP Brokers)** — staticCall dulu sebelum janji; sig dari API ≠ usable.
8. **Puzzle mints di-farm dari jam 0** — triage claim rate SEBELUM effort (Inference Angels: 10+/min, kalah reaktif).
9. **Out-of-gas (OOG) trap** — sim lulus tapi broadcast revert gasUsed≈limit → gasLimit 1M untuk commitment/signed mints.
10. **ethers v6 broadcastTransaction return OBJECT** — pakai `.hash`, bukan object (gagal siluman "pending").
11. **OpenSea API 503 collection valid** — fallback: DDG search + r.jina.ai reader proxy.
12. **Long hex addresses ke-truncate di tool args** — tulis via file, grep verify `0x` lengkap sebelum run.
13. **Auto-fire `Unexpected token 'C', "Collection"`** — API balikin teks = mint belum live / endpoint berubah.
14. **"execution reverted (no data)" + openCount==0 + side-contract undeployed = DEMO/not-live** (PonsRIG). `references/demo-not-live-detection.md`.
15. **Token-burn mint costing** — 2-token + fee, 50% burn permanen, quote $ SEBELUM eksekusi. `references/token-burn-mint-costing.md`.
16. **Mint yg butuh beli token burn: cari API RESMI platform-nya DULU, jangan reverse-engineer router** (Pool's Closed 2026-08-16): token launch platform (pools.fun/pump.fun) punya API swap resmi (`api.bankr.bot/pools-fun/swap/quote` → `{amountOut, minAmountOut, tx:{to,data}}` — sign tx apa adanya, value=amountIn ETH). Reverse-engineer router custom = revert 5x + buang 30 menit; API resmi sekali coba langsung jalan. Flow: quote → sign → broadcast → cek balance token → approve → mint. **Jangan rebuild calldata dari API — sign as-is.**
16. **SeaDrop-looking mint that reverts "could not decode result data" = OpenSea drops-API managed** (Cyclops Eyrix 2026-08-15) — plain `mintPublic` sim fails on every wallet even unminted; real txs go through a wrapper with embedded server signature. Don't grind the direct path: check `GET /drops/{slug}` (200 + active_stage = use drops API, key is in `.env`), or mint manually in UI. `references/opensea-drops-api-recon-detect.md`.
17. **Never assume the OpenSea key is "still pending"** — the dashboard key was approved 2026-08-15 and drops-API minting is PROVEN. Check `.env` for `OPENSEA_API_KEY` before concluding it's unavailable; re-request via dashboard only if it's actually missing/expired.
18. **Token-burn paid in launch-platform token: cek SUPPLY NFT DULU sebelum beli token** (Pool's Closed 2026-08-16) — beli 104K `$CLOSED` + approve sukses, tapi `mint()` revert `0x52df9fe5` (ExceedsMaxSupply) karena supply 1000/1000 udah sold out → token kebeli sia-sia (~$6). Baca `totalSupply()` vs `maxSupply()` di kontrak NFT sebelum beli burn-token; kalau deket cap, lapor & skip. Detail: `references/token-burn-platform-swap-api.md`.
19. **Jangan reverse-engineer DEX router kalau platform token punya swap API resmi** (Pool's Closed) — swap manual via router custom (`0x86ca0dc0` execute) revert berkali-kali; platform pools.fun punya `POST https://api.bankr.bot/pools-fun/swap/quote` yang langsung balikin `{tx:{to,data}}` siap-sign (sama kayak drops API — sign apa adanya, jangan rebuild calldata). Cari di JS situs platform: `swap/quote`, `swap/prepare`, `api.`. Detail: `references/token-burn-platform-swap-api.md`.
18. **Drops-API 409 "Drop is not currently active" ≠ dead — re-check drop config FIRST (Dirty Degen 2026-08-15):** a 409 on `POST /drops/{slug}/mint` mid-session usually means the STAGE changed (free→paid flip, or stage ended/replaced), not that the collection is dead. Sequence that burned time: recon showed `price:0` + `is_minting:true`, then minutes later all 15 wallets got 409; re-fetch `GET /drops/{slug}` showed `is_minting:null` momentarily then `price:0.025 ETH` on-chain. Rule: on 409 → re-fetch drop + `getPublicDrop` fresh; if price flipped → report to operator, DO NOT auto-pay (price-flip guard). Also note `is_minting` in the drops API response can flap (null/true) — trust on-chain `getPublicDrop`, not the API boolean.

## Support files added 2026-08-15

- `scripts/revoke-approvals.js` — post-mint revoke (ERC20 + NFT), audit mode. See `references/race-rpc-and-revoke-ops.md` §3.
- `scripts/mc-free-race-v7.js` — dynamic-window free-lane race (Alchemy-only, auto-adaptif, auto-stop).
- `scripts/setup-wallets-interactive.sh` + `scripts/sync-wallets-json.js` — fleet expansion Mode A (Rabby PK).
- `scripts/add-wallets.js` — Mode B (VPS-random, hanya kalau operator mau).

## Linked files

### Mint-type cheat sheet
| Mint type | Signature needed? | Pre-buildable? | Example / ref |
|-----------|-------------------|----------------|---------|
| Public mint (direct contract) | No | ✅ Yes | standard `publicMint()` |
| SeaDrop public stage (`mintPublic`) | No | ✅ Yes | GRUNKS — `references/seadrop-public-mint-recon.md` |
| FCFS allowlist (OpenSea) | Yes (server salt+sig) | ❌ No | `mintSigned()` — `references/opensea-fcfs-blueprint.md` |
| OpenSea-managed allowlist (drops API) | Backend sig via `POST /drops/{slug}/mint` | ✅ calldata ready | `references/opensea-drops-api.md` |
| Agentic PoW (puzzle API) | Backend co-sign | ❌ No | Neon Nodes — `references/agentic-pow-mint-pattern.md` |
| Multi-trial puzzle (commit/reveal) | On-chain hash | Solve→commit→reveal | Inference Angels — `references/inference-angels-puzzle-mint.md` |
| Global-window free mint | No | ✅ Yes (raced) | Rentoids — `references/global-window-race-full.md` |
| Phase-gated direct mint | No | ✅ Yes | BTC MACHINES — `references/mint-site-config-js-recon.md` |
| Token-burn multi-contract | Burn ERC20 @ quoted price | Via 3 txs | Robinhood Brokers — `references/token-burn-multi-contract-mint.md` |
| **Token-burn paid in launch-platform token (pools.fun dkk)** | ⚠️ **CEK SUPPLY DULU** sebelum beli token (Pool's Closed: mint revert `0x52df9fe5` karena sold out, token kebeli sia-sia); pakai **platform swap API** (`api.bankr.bot/pools-fun/swap/quote` → `{tx:{to,data}}` siap-sign) JANGAN reverse-engineer router custom | buy → approve → mint | Pool's Closed — `references/token-burn-platform-swap-api.md` |
| Backend-auth-gated (`mint(deadline, authSig)`) | Site backend issues sig | Browser-flow / sim first | LP Brokers — `references/backend-auth-gated-mint.md` |
| Stock-token mint (pay tokenized stock) | ERC20 payment token | approve → mint; buy route FIRST | `references/stock-token-mints.md` |
| Commitment-API signature mint | Backend issues commitment+sig | Public POST → automatable | `references/commitment-api-mint.md` |
| OpenSea-managed drops-API mint | Backend sig via `POST /drops/{slug}/mint` | ⚠️ butuh `OPENSEA_API_KEY`; sim reverts "could not decode" — detect via wrapper calldata | Cyclops Eyrix — `references/opensea-drops-api-recon-detect.md` |
| AI-gate interview + token-burn | Interview-graded + voucher | Gate manual; DAG-swap = skip | `references/ai-interview-gate-mint.md` |
| Zero-ETH claim (`receive()`) | No | `sendTransaction({to, value:0})` | `references/zero-eth-claim-mint.md` |
| Scatter.art launchpad | Backend-signed tx | Via `POST /v1/mint` | FUWA — `references/scatter-launchpad-mint.md` |

### References (canonical)
- `references/platform-token-buy-mint.md` — token-burn mint: beli token via API resmi platform (pools.fun → api.bankr.bot, quote → sign-as-is → approve → mint); jangan reverse-engineer router
- `references/osnm-z-eval.md` — **evaluasi 2 tool komunitas (2026-08-16)**: OSNM-Z (Rust, mint OpenSea tanpa API key via SIWE — TAPI cuma 1-stage, cadangan darurat) + nft-public-mint/Morsy (duplikat seadrop-race-v3 kita, connection-warmer gak worth). Pola evaluasi tool: bedah kode → bandingkan toolkit → duplikat? jangan install, catat aja
- `references/token-burn-platform-swap-api.md` — **token-burn paid in launch-platform token** (Pool's Closed): cek SUPPLY NFT dulu sebelum beli token (sold-out trap `0x52df9fe5`), pakai platform swap API (`api.bankr.bot/pools-fun/swap/quote` → `{tx:{to,data}}` siap-sign), jangan reverse-engineer router custom; cara nemu platform swap API dari JS
- `references/mint-route-playbook.md` — **nemuin jalur mint di website BARU (wajib baca saat recon)**: decision tree SeaDrop/direct/API/token-burn, cari CA di RSC payload, ground-truth = decode tx sukses asli, pitfalls route
- `references/osnm-z-fallback-tool.md` — **OSNM-Z Rust CLI (fallback mint OpenSea tanpa API key)**: SIWE auth, multi-wallet; LIMITASI: cuma 1-stage aktif; sponsored/EIP-7702 JANGAN dipake; installed di `~/tools/osnm-z/`
- `references/game-gated-mint.md` — **game-gated mint (play-to-mint, SPAWNHOOD)**: HTML5 game + server voucher, MANUAL only — agent gak bisa main game; cek getCode(ownerAddr) buat tau live/belum

- `references/revoke-approvals.md` — revoke approvals after every project (operator rule, pernah ke-drain)
- `references/gameplay-gated-mint.md` — play-to-mint arcade (SpawnHood): canvas game + server voucher, anti-bot, butuh human; deteksi via game.js mint ABI + getCode owner
- `references/multi-agent-fleet-deployment.md` — second Hermes agent deployment (operator took Europe/Tencent; incl. orca-router config keys, Hermes install walkthrough, **persona handoff — fresh agents answer Robinhood WRONG unless persona forces read-skill-first, chain 4663 = home turf**)
- `references/hermes-fresh-vps-install.md` — **Hermes install di VPS baru step-by-step (MobaXterm → working agent)**: gotcha PATH (`venv/bin/hermes`), config key `model.default` bukan `model.name`, router custom orca (`sk-orca-` → provider openai + base_url), firewall Contabo, keamanan key gak lewat chat
- `references/agent2-vps-tencent-setup.md` — **Tencent Cloud Virginia setup (agent #2, 2026-08-16)**: region Virginia utk Robinhood latency, bundle 2vCPU/4GB, image Ubuntu+Docker, install Hermes fresh + PATH fix (`~/.hermes/bin`), wizard pilihan (Quick Setup → Local → Telegram), API key ketik di terminal bukan chat, MobaXterm multi-server

- `references/multi-agent-fleet-deployment.md` — **second Hermes agent deployment (VERIFIED 2026-08-16)**: VPS US-East + install (PATH fix venv/bin), `hermes setup model` custom-direct provider, Telegram gateway (Space to select, "Any cannot be instantiated" fix), persona propagation (AGENT2-PERSONA.md → SOUL.md + skill pack), wallet fleet BEDA
- `references/operator-speed-and-rpc-rules.md` — operator speed & decision rules (session-hardened)
- `references/operator-workflow-mandates.md` — operator workflow mandates (how mint/race is done)
- `references/gpu-pow-farm-setup.md` — GPU PoW farm setup & rental guide (puzzle-mint PoW tails)
- `references/commitment-api-mint.md` — commitment-API signature mints (LOTS): public POST → automatable; OOG trap, gate-flip, backend reset
- `references/race-rpc-and-revoke-ops.md` — session ops bundle: dynamic-window, commitment API, demo-lock, Alchemy 429 + 2-key rotation, post-mint revoke
- `references/ai-interview-gate-mint.md` — AI-gate interview mint (aiko): interview-graded gate + token-burn; DAG-swap blocker; DexScreener 32-byte pool trap
- `references/demo-not-live-detection.md` — deteksi demo/not-live (PonsRIG): revert tanpa data + openCount==0 + side-contract undeployed
- `references/token-burn-mint-costing.md` — token-burn costing (Stonkbankers): 2-token + fee, 50% burn, quote $ dulu
- `references/stock-token-mints.md` — stock-token mints (WallStreetBrokers): cek buy-route DULU
- `references/multi-wallet-mint-fleet.md` — multi-wallet fleet + VPS hardening
- `references/global-window-race-full.md` — full detail free-mint global window race (pre-sign, -165ms, operator insight, tuning)
- `references/dynamic-window-free-mint-race.md` — dynamic-window race (Merge Cats): freeWindow live-read, v7 script
- `references/minting-logic-brain.md` — distilled minting logic: contract-reading, classification, race mechanics, nonce mgmt, hard stops
- `references/wallet-nft-holdings-investigation.md` — NFT di Etherscan tapi gak muncul di OpenSea: diagnosis + fix
- `references/session-setup-state.md` — live setup: wallet fleet, active pipelines, closed projects
- `references/seadrop-public-mint-recon.md` — SeaDrop PUBLIC = mintPublic no-sig: cari SeaDrop dari multiConfigure, baca getPublicDrop
- `references/mint-site-config-js-recon.md` — site config.js recon: CONTRACT_ADDRESS + ABI plaintext, phase-gated pattern
- `references/scatter-launchpad-mint.md` — Scatter.art API flow (FUWA): eligible-invite-lists → POST /v1/mint
- `references/opensea-fcfs-blueprint.md` — reverse-engineered OpenSea FCFS/allowlist (gql.opensea.io, SIWE)
- `references/agentic-pow-mint-pattern.md` — puzzle → solve → sign → submit (Neon Nodes)
- `references/agentic-pow-puzzle-mint.md` — multi-kind puzzle + sealed trials + keccak-abi hash (Inference Angels)
- `references/inference-angels-puzzle-mint.md` — full Inference Angels mechanics + solvers
- `references/global-window-free-mint-race.md` — Rentoids: staticCall-before-broadcast, win-rate data
- `references/free-mint-race-lessons.md` — Rentoids live run: win-rate, hammer failure, RPC rate-limit
- `references/public-mint-race-lessons.md` — hard-fail postmortems (BTC MACHINES 18s, TOADLINGS <10s)
- `references/apps-script-whitelist-claim.md` — Google Apps Script WL claim sites (The Bufos): node-fetch wajib
- `references/robinhood-rpc-inventory.md` — RPC latency measurements (Alchemy 76ms fastest)
- `references/multi-wallet-and-api-mint-patterns.md` — fleet layout, anti-double-command, dual-RPC
- `references/token-burn-multi-contract-mint.md` — buy-$BROKER → approve → raise flow
- `references/project-vetting-x-presence.md` — vet by X presence (fxtwitter), decision table
- `references/profit-reconstruction.md` — P&L after sales: separate top-ups from proceeds
- `references/opensea-api-access.md` — instant free API key, 405 on orders, key pitfalls
- `references/opensea-drops-api.md` — drops API allowlist automation (POST /drops/{slug}/mint)
- `references/opensea-drops-api-recon-detect.md` — detect OpenSea-managed mints: sim reverts "could not decode" + real tx via wrapper with embedded sig (Cyclops Eyrix)
- `references/opensea-managed-allowlist.md` — OpenSea-managed allowlist (diagnostic)
- `references/backend-auth-gated-mint.md` — mint(deadline, authorization) browser-gated (LP Brokers)
- `references/zero-eth-claim-mint.md` — receive() zero-ETH claim, 1/wallet
- `references/scatter-art-mint-platform.md` — Scatter platform notes
- `references/wl-task-probing.md` — quest/WL tasks client-side only (The Galleria)
- `references/x-api-setup-for-wl.md` — X Developer Portal setup, OAuth headless
- `references/mint-project-research.md` — per-project research recipe
- `references/vercel-checkpoint-bypass.md` — Vercel/Cloudflare 429 handling
- `references/screenshot-ocr-no-vision.md` — OCR screenshots via tesseract+PIL
- `references/zyper-aio-automation-tool.md` — Zyper AIO pricing vs our capability
- `references/gpu-pow-farm-setup.md` — GPU farm kit (rental guide)
- `references/session-setup-state.md` — live fleet state

### Templates & scripts
- `scripts/mc-free-race-v7.js` — **CURRENT dynamic-window free-lane race**: reads freeWindow() live, auto-adaptif (5s→3600s), Alchemy-only 2-key + 429-cooldown, auto-stop pas free lane abis, balanceOf win-detection
- `scripts/seadrop-race-v3.js` — **CURRENT SeaDrop start-gate race** (v3.2): pre-sign, T-0 +1s buffer, qty-adjust, drip-fire option
- `scripts/revoke-approvals.js` — post-mint revoke ERC20 + NFT, audit mode, Alchemy-only
- `scripts/setup-wallets-interactive.sh` — fleet Mode A (paste Rabby PK hidden)
- `scripts/sync-wallets-json.js` — register wallets from .env, backup .bak
- `scripts/add-wallets.js` — fleet Mode B (VPS-random)
- `scripts/rebalance.js` — auto-topup wallet ke target $, reserve $5
- `scripts/check-eligible.js` — eligibility scan (hanya saat diminta)
- `scripts/nft-sweep.js` — NFT + ETH sweep
- `scripts/milestone-watchdog.sh` — per-wallet milestone watchdog (cron, silent)
- `scripts/opensea-drop-mint.js` — drops API mint (SLUG + qty)
- `scripts/drops-mint.js` — **generic drops API mint (VERIFIED Cyclops 14/14)**: `SLUG=<slug> QTY=<n> node drops-mint.js <wallets>`; sign calldata from `POST /drops/{slug}/mint` (wrapper + embedded OpenSea sig — sign as-is, don't decode). 409 = stage not active, 422 = not eligible.
- `scripts/free-mint-race-fanout.js` — fan-out multi-RPC racing loop
- `scripts/free-mint-race-presign.js` — pre-sign & fire, --lead mode
- `scripts/free-mint-race-loop.js` — window-based loop (--hammer)
- `scripts/seadrop-fcfs-race.js` — pre-sign + parallel fire SeaDrop
- `scripts/seadrop-race-v2.js` — lead-fire + hedge split
- `scripts/commit-reveal-parallel-claim.js` — parallel commit/reveal claimer
- `scripts/puzzle-farm.js` — commit-reveal farm pipeline (L1 clock)
- `scripts/puzzle-relic-solver.mjs` — relic-puzzle solver (AES-CBC)
- `scripts/puzzle-mint-sweep.py` — puzzle mint sweep
- `scripts/pow-sha256-cracker.cu` — CUDA SHA-256 prefix cracker
- `templates/setup-wallet.sh` — per-wallet PK onboarding (operator-run)
- `templates/seadrop-multi-wallet-mint.js` — battle-tested SeaDrop multi-wallet
- `templates/seadrop-public-mint-multiwallet.js` — SeaDrop mintPublic multi-wallet
- `templates/multi-wallet-distribute.js` — leader → targets distribution
- `templates/multi-wallet-mint.js` — max-affordable mint, duplicate guard
- `templates/free-mint-race.js` — pre-sign & fire template
