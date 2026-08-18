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
- **EXPLAIN NOVEL MECHANICS FIRST (2026-08-18, MINECAT):** kalau project punya mekanik BARU/unfamiliar (mining game, gameplay, mekanik rumit) → operator minta dijelasin DULU cara kerjanya (mekanik, biaya, risiko, hasil audit keamanan) lalu tunggu konfirmasi — JANGAN langsung gas walau kontrak live ("kasih tau gw lalu eksekusi kalo gw dah paham"). Operator juga minta audit keamanan eksplisit buat mekanik baru ("aman gak, takut kedrain") — jawab dengan hasil cek: approve zero, value tx exact, PK lokal, verified contract, max loss per tx.
- **CLEANUP SAAT INVESTIGASI MANDUL (2026-08-18):** kalau investigasi (riddle/teka-teki/eligibility) gak dapet hasil → langsung hapus semua file temp & stop, JANGAN lanjut grind; lapor singkat + bersih. Operator: "kalo ga dapet apa2 hapus aja".
- **QTY RULE (KRITIKAL, pelajaran GreedCats overshoot):** operator bilang "mint N per wallet" = PAS N/wallet × semua wallet, 1 transaksi per wallet, TANPA sweep/perkalian. Sweep/drip 4-nonce HANYA kalau operator bilang "hajar max" / "dapetin sedapetnya". Selalu sebut total biaya dalam $ SEBELUM gas.
- **💸 COST-SENSITIVITY CHECK buat PAID mint (2026-08-18, operator: "$30 itu banyak lho" setelah RWAKERS + "harga mintprice sama floor tidak bersahabat"):** operator SENSITIF terhadap pengeluaran paid mint — $30 untuk 31 NFT dianggap BANYAK. Sebelum gas paid mint: (1) cek floor price OpenSea vs mint price, (2) kalau floor < mint price atau margin tipis → lapor ke operator "mint price X, floor Y, margin tipis, tetap gas?" JANGAN auto-gas paid mint yang floor-nya gak jelas tanpa mention margin. Untuk FREE mint: gas tanpa ragu (sesuai standing approval), tapi lapor total gas terpakai. Operator lebih suka kita hemat + nargetin yang beneran untung.
- **COMMAND FORMAT (2026-08-17, operator clarification):** "mint N wallet X" = mint N NFT HANYA di wallet X (SINGULAR), BUKAN semua wallet. Contoh: "mint 1 nft wallet 15" = 1 NFT cuma wallet 15. "mint N semua wallet" = semua wallet. Kalau balance wallet target kurang → agent REBALANCE otomatis dari leader (distribute.js) ke wallet itu, jangan tanya.
- **SELL COMMAND FORMAT — CA-FIRST (2026-08-17, operator: "Formatnya pakai CA nft address opensea?"):** sell command pakai **CA (contract address)** sebagai identifier utama: `sell nft 0x<CA> wallet <N>, <qty> nft di <harga> eth`. Nama project (mothbroker dkk) cuma alias untuk CA yang udah dikenal dari history/session — kalau ada keraguan (bukan CA, bukan project dikenal) → tanya operator sebelum eksekusi, JANGAN asal cari di OpenSea (bisa salah kontrak). CA = ground truth dari Blockscout/site, bukan dari OpenSea (koleksi bisa belum ke-index).
- **SELL WALLET SELECTION (2026-08-17, operator: "tambahin opsi wallet berapa aja yang mau gw sell biar ga harus bulk sell"):** wallet selection di sell command fleksibel, sama kayak pola mint: single (`wallet 15`), list (`wallet 1,2,3`), range (`wallet 1-5`), semua (`wallet all` / `wallet semua`). QTY = per wallet terpilih (sama seperti mint). Contoh: `sell nft 0x9501... wallet 1,5,9-12, 2 nft di 0.001 eth` = wallet 1,5,9,10,11,12 masing-masing listing 2 NFT @ 0.001 ETH. Parse rule: koma = list, strip = range, all/semua = semua active wallet.
- **NEVER over-mint vs instruksi:** cap 10, operator bilang 3 → mint PAS 3. Instruksi exact selalu menang.
- **🚨 AGENT EKSEKUSI SENDIRI — JANGAN MINTA OPERATOR SUAPIN (2026-08-16, Pool's Closed):** operator marah: "lo yg belajar eksekusi masa gw suapin" — untuk mint yang butuh beli token/swap, agent WAJIB cari jalur eksekusi sendiri. Urutan: (1) cari API RESMI platform (pools.fun → api.bankr.bot — pitfall #16), (2) kalau gak ada, telusuri tx swap asli di chain, (3) JANGAN nyuruh operator beli manual kecuali benar-benar buntu total & sudah coba semua jalur.
- **🚨 AGENT EKSEKUSI SENDIRI — JANGAN MINTA OPERATOR SUAPIN (HARD RULE 2026-08-16, Pool's Closed, operator: "lo yg belajar eksekusi masa gw suapin"):** untuk mint yang butuh langkah tambahan (beli token, swap, approve), AGENT yang cari & eksekusi jalur lengkap sendiri — jangan balikin step teknis ke operator ("lo beli token dulu", "transfer ke wallet X", "cek ini itu"). Urutan: (1) cari API RESMI platform (pools.fun → api.bankr.bot — pitfall #16), (2) kalau gak ada, telusuri tx swap asli di chain, (3) JANGAN nyuruh operator beli manual kecuali benar-benar buntu total & butuh UI browser (game-gated / interview-gate) — itu baru kasih instruksi singkat. Operator minta hasil, bukan instruksi.
- **🚨 JANGAN TANYA "MAU GUE SAVE/LAKUKAN?" — LANGSUNG EKSEKUSI + SAVE (2026-08-16, operator mandate: "jangan tanya gw kalo emang menurut lo penting di save yang ga berguna di buang"):** pelajaran baru yang worth → save ke references + 1 baris link langsung, tanpa minta izin. Yang gak berguna/duplikat → buang langsung. Jangan akhiri kerjaan dengan pertanyaan "mau gue save?" Hal yang sama berlaku buat keputusan eksekusi — jangan minta konfirmasi hal yang udah di-cover standing approval.
- **📦 SUPPLY INTEL = TANGGUNG JAWAB OPERATOR (2026-08-16, operator: "ga perlu cek supply, kalo gw minta lo mint pasti supplynya masih ada"):** untuk mint yang operator request, SKIP cek supply/totalSupply — langsung eksekusi. Kalau ternyata sold out, lapor aja; jangan jadikan cek-supply step wajib. (Pengecualian: evaluasi peluang SEBELUM operator putuskan boleh — tapi kalau instruksi mint sudah jelas, gas langsung.)
- **💰 PAID MINT: FLOOR vs MINT PRICE CHECK + REBALANCE-COST REALITY (2026-08-18, operator 2x kecewa — "mint banyak buat gw 30$ itu banyak lho", "harga mintprice sama floor tidak bersahabat"):** operator SEKARANG eksplisit soal biaya paid mint — $30 itu BANYAK buat dia. Sebelum saranin/gas paid mint (terutama multi-wallet), cek & lapor: (1) total biaya $ SEMUA wallet + gas, (2) **floor price saat itu vs mint price** (OpenSea `/api/v2/collections/{slug}` atau `nft-sell.js` holdings check) — kalau floor ≤ mint price, proyek gak worth paid → lapor + saran skip, JANGAN auto-gas. Rebalance $5/wallet ke wallet tipis = pola disetujui (distribute.js, nonce per-wallet increment). Uang yang udah kepake di mint sebelumnya gak ngaruh ke keputusan berikutnya — evaluasi tiap project fresh.
- **🚫 PROJECT TANPA PUBLIC LANE = SKIP CEPAT (2026-08-18, Bunkerhood):** kalau site cuma punya GTD/WL (merkle) dan wallet fleet gak ada di tree publik (`/allowlists/*-tree.json`) → gak ada jalur mint sama sekali → lapor + SKIP, jangan grind, jangan buang tx revert. Cek eligibility via publik merkle JSON jauh lebih murah daripada coba mint.
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
- **🚫 STOP-AND-CLEAN RULE (2026-08-17, Bandit List):** investigasi yang mentok (endpoint diblok proteksi server/Cloudflare, tool gak tersedia, provider login gagal) → STOP setelah usaha wajar: crack protokol + beberapa variasi retry, JANGAN nge-grind approach/provider yang sama. Lapor temuan teknis singkat + alasan stop, BERSIHKAN semua file temp (/tmp), jangan overclaim. Operator eksplisit: "kalo ga bisa... stop dan hapus percakapan tentang ini". Gagal di 1 provider = langsung tawarkan alternatif (pola Contabo/Vast.ai).
- **Report WINS FIRST, script work SECOND** — operator: "dapet ga sih upgrade mulu" = tuntut hasil dulu, cerita teknis belakangan.
- **🚨 GITHUB SCOPE = NFT-ONLY (HARD RULE 2026-08-18, operator marah: "gw mau cuma HAL YANG BERHUBUNGAN DENGAN SKILL NFT di luar itu tidak usah di sebar di github"):** redact secret aja GAK CUKUP — repo publik cuma boleh berisi KONTEN NFT MINTING. SEBELUM push, HAPUS dari `~/nft-skill-public/` semua file yang bukan konten skill NFT: setup agent #2 (agent2-*), VPS install (hermes-fresh-vps-install), cost audit (hermes-usage-cost-audit), fleet deployment (multi-agent-fleet-deployment), operator rules internal (operator-*), session state (session-setup-state), provider wiring non-NFT (tokenrouter-*, open-race-poll-fire-and-tokenrouter-provider). TERUS hapus baris dead-link yang nyebut file2 itu di SKILL.md public (grep `agent2|tokenrouter|multi-agent-fleet|session-setup|operator-speed|operator-workflow|publish-skill|external-llm|hermes-fresh|hermes-usage` → hapus barisnya). Verifikasi akhir: `grep -cE "agent2|tokenrouter|multi-agent|session-setup" SKILL.md` = 0. Commit pesan harus sebut "hapus file non-NFT".
- **Vetting (X followers) = DEPRECATED default:** cuma dipake kalau operator eksplisit tanya "legit gak". Then: `api.fxtwitter.com/<handle>` → followers ≥5k aktif = worth, <100 = lemah.
- **Approval (`approvals.mode = off`)** — auto-approve (perlu /restart untuk memastikan aktif).
- **Model:** flash utk minting (TTFT cepet), pro cuma maintenance skill. Jangan pro saat race.
- **Sell / take-offer = operator MANUAL (2026-08-15, rebuild keep):** operator jual NFT sendiri sesuai keputusan dia ("gw manual juga buat sell2 nft sesuai decision gw"). Agent TIDAK pernah auto-sell / auto-accept offer / push fitur jualan tanpa perintah eksplisit. Kalau operator minta bantu jual: eksekusi harga/threshold yang dia tentukan, verifikasi on-chain, jangan pernah invent angka. P&L: `references/profit-reconstruction.md`.
- **🚨 SELL VIA AGENT COMMAND (2026-08-17, operator mandate — OVERRIDE aturan sell manual + VERIFIED WORKING 15/15):** operator eksplisit: "kalau bisa, kedepannya gw atur semua selling lewat lu juga". Format command: `sell nft <CA> wallet <sel>, <qty> nft di <harga> eth` (sel: single/list/range/all). **RESEP YANG BENER (verified 2026-08-17, MothBroker 15/15 POSTED):**
  1. Endpoint: **`POST https://api.opensea.io/api/v2/orders/{chain}/seaport/listings`** — chain RH = `robinhood` (BUKAN robinhood_chain, BUKAN suffix /post, protocol `seaport` bukan seaport1.6). Body: `{parameters, signature, protocol_address}` (camelCase inner struct, snake_case outer).
  2. Conduit: conduitKey WAJIB `0x[YOUR_WALLET_ADDRESS]12b3a3f89aa88525877f1d5e` (OpenSea RH conduit; zero = rejected). Address conduit: `0x[YOUR_WALLET_ADDRESS]` (via ConduitController.getConduit) — approve CONDUIT ini di NFT contract, bukan Seaport.
  3. Fee wajib: consideration = [harga−1% → seller, 1% → `0x0000a26b00c1F0DF003000390027140000fAa719`] + `totalOriginalConsiderationItems: 2`. 10% creator fee (required:false) gak wajib.
  4. Sign: EIP-712 domain {name:'Seaport', version:'1.6', chainId:4663, verifyingContract: Seaport RH `0x[YOUR_WALLET_ADDRESS]`}, counter dari getCounter (0 biasanya).
  5. Verify: `GET /api/v2/orders/chain/robinhood/protocol/{seaport}/{order_hash}` → 200 = indexed. Cek koleksi: `GET /api/v2/collections/{slug}` (slug BUKAN address — cari slug via search; MOTH = `moth-broker`).
  - Error 400 validation = koreksi fee/conduit; 404 = salah path/chain; 405 = salah method. Harga SELALU dari operator. Floor cuma kalau diminta. `scripts/` punya `mothbroker-sell.js` sebagai template (edit NFT/TOKENS/PRICE/WALLETS).
  - **CANCEL LISTING (2026-08-17, verified):** order dengan zero-zone TIDAK bisa offchain-cancel di OpenSea (itu cuma jalan kalau pake SignedZone). Cara bener: **`Seaport.incrementCounter()`** per wallet (1 tx, gas ~25K) — invalidate SEMUA order dari wallet itu sekaligus (on-chain, langsung). Kemudian revoke conduit approval. Untuk cancel-cleanup penuh: `scripts/audit-all.js` (scan NFT approvals × [Seaport, Conduit] + ERC20 allowance project token-burn) → `scripts/revoke-total.js` (cancel listing + revoke conduit + approve 0). **Recipe lengkap + pitfalls (BigInt replacer, zero-conduit, EIP-712 types, receipt-scan holdings, Blockscout endpoints): `references/seaport-listing-sell-flow.md`.**

## Mint Platforms & Flow

| Platform | Agent role |
|----------|-----------|
| OpenSea | Deteksi mint link, eksekusi contract mint |
| Project website | Parse mint button → contract call |
| Agentic PoW (puzzle API) | Solve → sign → submit (Neon Nodes: `references/agentic-pow-mint-pattern.md`) |
| Scatter.art launchpad | `api.scatter.art` (www sering Vercel-block): collection → eligible-invite-lists → POST /v1/mint → sign. **Query eligible PER WALLET (`?minterAddress=`) — list FREE merkle-gated gak muncul tanpa itu** (WOJAK: cuma 2/15 wallet eligible free). `references/scatter-launchpad-mint.md` |
| Direct contract | Best: bypass UI, call mint() langsung |

**Agentic PoW flow:** POST /api/puzzle {wallet} → solve → POST /api/solve → sign lokal → POST /api/submit. Multi-kind + sealed trials (Inference Angels): `references/agentic-pow-puzzle-mint.md` + `references/inference-angels-puzzle-mint.md`. Read project skill.md FIRST.

**Commitment-API mints** (backend-issued commitment+sig, public POST): `references/commitment-api-mint.md` — OOG trap (gasLimit 1M), ethers v6 broadcast object, gate-flip mid-window.

**OpenSea drops-API mints — KEY NOW WORKING (2026-08-15):** dashboard key approved, stored as `OPENSEA_API_KEY` in `/home/ubuntu/mint-wallets/.env`. Proven on Cyclops Eyrix (14/14 wallets, seadrop_v1_erc721 public stage, 0.0001 ETH each). `POST /api/v2/drops/{slug}/mint {minter, quantity}` → 200 `{to, data, value}` → sign as-is (wrapper + embedded OpenSea sig — DON'T rebuild calldata) → broadcast (gasLimit 400k). Works for PUBLIC stages too, not just allowlists. Use `scripts/opensea-drop-mint.js` (generic). Detection when a SeaDrop "public" sim reverts with "could not decode": it's drops-API managed — `references/opensea-drops-api-recon-detect.md` + `references/opensea-drops-api.md`. Note: for drops-API mints the `getMintStats(wallet)` 1-arg on the NFT contract works; the SeaDrop 2-arg variant ERR'd — use the NFT contract's own.

**Drops-API stage-poll RACE untuk mint terjadwal (Knights of Hood 2026-08-18):** `GET /api/v2/drops/{slug}` balikin `{is_minting, active_stage:{stage_type,label,price,max_per_wallet,start_time,end_time}, next_stage}`. Untuk mint yang stage-nya belum buka (mis. public_sale mulai 01:00 UTC): arm script yang POLL `active_stage.stage_type` tiap ~5s sampai flip ke target stage (dan `price === '0'` kalau FREE) → fetch calldata SEMUA wallet paralel → broadcast paralel → verify. Guard: jangan fire kalau `active_stage.price !== '0'` (price-flip guard) walau stage-nya bener. Script contoh: `/home/ubuntu/mint-wallets/koh-race.js` (qty 10/wallet, 15 wallet, proven flow). Stage bisa ada signed_presale (WL, max 3) duluan sebelum public_sale — polling bedain stage mana yang aktif, jangan asumsi.

## ⚠️ Robinhood Chain Gas Quirk (CRITICAL)

**WETH canonical Robinhood (2026-08-17, verified 420K holders):** `0x[YOUR_WALLET_ADDRESS]` — SEMUA wETH lain di chain (0x40dB…, 0x900C…, 0x94A5…, dst) cuma copy-an (<200 holders). Kalau perlu unwrap WETH→ETH: `weth-unwrap.js` (baca balanceOf per wallet → `withdraw(wei)` → verify; wallet dengan 0 WETH auto-skip). Cara nemu canonical kalau lupa: Blockscout `/api/v2/search?q=WETH` → kandidat dengan holders terbanyak = canonical.

Robinhood (Arbitrum-style L2, single sequencer): base fee ~0.02 gwei, EIP-1559 refunds unused ceiling. **JANGAN trust `provider.getFeeData()`** (inverted/garbage). **Hardcode:**
- **WETH canonical RH (2026-08-17):** `0x[YOUR_WALLET_ADDRESS]` (420K holders — kandidat lain cuma bridged copy <200 holders; verifikasi via holders count di Blockscout). Unwrap WETH→ETH: `WETH.withdraw(amount)` (script `scripts/weth-unwrap.js` di mint-wallets, idempotent).
```javascript
chainId: 4663, // WAJIB eksplisit! ethers v6 default chainId=0 → "invalid chain id for signer"
gasLimit: 220000, // commitment/signed mints: 1,000,000 (OOG trap!)
maxFeePerGas: ethers.parseUnits("0.5","gwei"), // ceiling = free insurance, refunded
maxPriorityFeePerGas: ethers.parseUnits("0.01","gwei"),
type: 2,
```

**⚠️ GAS DOES NOT WIN FCFS ON ROBINHOOD (verified on-chain):** single sequencer FIFO by ARRIVAL, bukan gas auction. Proof (Toadlings): whale menang di 0.0275 gwei, kita 10 wallet priority 7x lebih tinggi ALL LOST. Yang menang: **arrival time** (lead-fire, drip-fire), RPC route/latency, geography. High ceiling 0.5 gwei = asuransi anti-spike (refunded kalau gak kepake).

**Robinhood chain constants (2026-08-18):** canonical WETH = `0x[YOUR_WALLET_ADDRESS]` (420K holders — yang lain cuma copy-an <200 holders). Unwrap WETH→ETH = `withdraw(wad)` (gas ~100k). Seaport 1.6 = `0x[YOUR_WALLET_ADDRESS]`; OpenSea conduit = `0x[YOUR_WALLET_ADDRESS]` (key `0x61159fef...`) — lihat rule SELL VIA AGENT COMMAND.

## RPC — SEMUA ALCHEMY (HARD RULE 2026-08-15, operator mandate)

- **SEMUA read/probing/recon/scan/fire WAJIB Alchemy** (72ms). **canonical & drpc SUDAH DIHAPUS dari semua script** — canonical 295-860ms bikin lelet (Reptillians sold out saat recon; scan 2000 blok timeout). drpc gak support eth_blockNumber.
- 2-key rotation: `alch_[YOUR_ALCHEMY_KEY]...` (utama) + `alch_[YOUR_ALCHEMY_KEY]...` (cadangan) + 30s 429-cooldown auto (v7). Details: `references/race-rpc-and-revoke-ops.md`.
- Alchemy free tier aman buat recon (puluhan call); polling race ringan (freeWindow tiap 5s) juga aman.
- **WETH canonical Robinhood (2026-08-17):** `0x[YOUR_WALLET_ADDRESS]` (420K holders — kandidat lain <200 holders = copy-an/scam). Unwrap WETH→ETH = `withdraw(wad)` langsung di kontrak WETH (nonpayable, value 0, ~50-90k gas, idempotent — wallet yang WETH-nya 0 auto-skip). Script: `/home/ubuntu/mint-wallets/weth-unwrap.js`.

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
| **Proxy/upgradeable/self-destruct (2026-08-16 review)** | Cek: contract di belakang proxy (implementation address), upgradeable pattern, opcode `SELFDESTRUCT`/`0xff` di bytecode → kontrak bisa diubah/dimusnahkan owner → SKIP atau verifikasi ownership dulu. **Cek bytecode PAKAI PUSH-AWARE SCAN, bukan grep 0xff mentah** (2026-08-18, RWAKERS: naive scan lapor "SELFDESTRUCT 232x" di contract BERSIH — byte 0xff/0xf4 itu data operand PUSH32, bukan opcode). Script: `scripts/scan-bytecode-opcodes.py` `<rpc> <CA>` (auto-baca Alchemy key dari mint-wallets/.env kalau rpc di-omit). |
| **Safety filters TETAP ON** | Jangan install jailbreak skills (godmode dll) di mint agent — proteksi prompt injection dari situs scam. |
| **VERIFIED + docs lengkap ≠ AMAN (MINECAT 2026-08-18, operator intel komunitas)** | MINECAT (minecatnft.com, CA 0x6147a524…) kelihatan 100% legit: contract VERIFIED di Blockscout, bukan proxy, docs rapi, CLI miner resmi, skill file, market page. Gw audit bersih (0 approval, claim value = persis mintPriceWei, PK lokal). TAPI operator vonis SCAM via intel komunitas ("orang lain yang deploy buat nipu") → STOP TOTAL, kill proses, hapus file, revoke semua, jangan debat. Pelajaran: penampilan legit itu BISA ditiru; intel operator > audit. Design defensif kita (hot wallet kecil, 0 approval, verified, value bounded) bikin kerugian cuma ~$0.21 — pertahanan berlapis itu yang nyelametin. |
| **"Verified ≠ aman" (2026-08-18, MINECAT)** | Contract verified + docs lengkap + CLI rapi + skill file ≠ legit. MINECAT (`0x[YOUR_WALLET_ADDRESS]`, minecatnft.com, PoW keccak mining) di-vonis **SCAM** oleh operator via intel komunitas SETELAH kita full-fleet mining (loss kecil ~$0.21, gak ada approval = aman). Aturan: operator flag project → **STOP INSTAN**, kill semua proses, hapus semua file, verifikasi 0 approval, lapor kerugian max. Kontrak umur <24h (walau verified): **test 1 wallet `--once` dulu SEBELUM full fleet** — jangan langsung gas semua wallet. |

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

## Flag-Flip Poll Race — mint opens on a transaction, NOT a countdown (2026-08-18, RWAKERS)

Project docs: "The mint itself opens on a transaction, not on a countdown" = owner calls `setMintOpen(true)` kapan aja; TIDAK ada schedule yang bisa di-pre-position. Race pattern (VERIFIED 15/15, 31 NFT: 1 free merkle + 30 paid):
1. **Pre-sign SEMUA tx duluan** (free tier: fetch merkle proof → encode `mint(uint256,bytes32[])` value 0; public: `mint(uint256)` value = price×qty). Pre-sign = race menang sebelum flag flip.
2. **Poll `mintOpen()` tiap 1.5s** via Alchemy (single sequencer RH — arrival-time, bukan gas war).
3. Pas flip: **price-flip guard** (re-read `price()` fresh; mismatch → STOP) → `Promise.all` broadcast paralel (nonce per wallet).
4. Verify receipt + decode `Transfer(from=0x0)` events → tokenIds.
Full detail + pitfalls (ethers overloaded sig, `proofs` nested vs `proof` flat, wallets.json dict format, bytecode push-aware scan): `references/rwakers-flag-flip-race.md`. Template: `templates/flag-flip-poll-race.js`.

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
14b. **Scatter free-list STALE vs TRUNCATED PROOF (kena 2x: punkx 2026-08, WOJAK 2026-08-17):** API eligible-invite-lists + POST /v1/mint masih kasih tx `value:0` buat free list, tapi broadcast revert `require(false)`. DUA penyebab beda, JANGAN langsung vonis "list tutup":
    - **STALE (punkx):** list beneran udah tutup on-chain — API gak re-check liveness.
    - **TRUNCATED PROOF (WOJAK):** list MASIH HIDUP, tapi API `/v1/mint` ngasih merkle proof GAK LENGKAP (510 bytes = 1 item) sementara website generate proof LENGKAP (1546 bytes = 11 item, root sama `0xa8aed5c8...`). Operator mint manual 2 menit setelah revert kita — list gak mati, API-nya yang rusak.
    - **Ground-truth check sebelum vonis:** Blockscout `GET /api/v2/addresses/{nft}/transactions` → cari tx `0x4a21a2df` terbaru dengan `result: success` dari wallet MANA PUN → `eth_getTransactionByHash` → bandingkan `data.length` vs yang API kasih. Data API lebih pendek = truncated proof = API path gak usable → lapor "API proof rusak, mint manual di website" BUKAN "list tutup". Kalau operator bilang dia bisa mint manual → PERCAYA, jangan debat — langsung cek ground truth.
    - Cek eligible PER WALLET (`?minterAddress=`) — list FREE merkle-gated gak muncul di query tanpa filter wallet (WOJAK: cuma 2/15 wallet eligible free).
15. **Token-burn mint costing** — 2-token + fee, 50% burn permanen, quote $ SEBELUM eksekusi. `references/token-burn-mint-costing.md`.
16. **Mint yg butuh beli token burn: cari API RESMI platform-nya DULU, jangan reverse-engineer router** (Pool's Closed 2026-08-16): token launch platform (pools.fun/pump.fun) punya API swap resmi (`api.bankr.bot/pools-fun/swap/quote` → `{amountOut, minAmountOut, tx:{to,data}}` — sign tx apa adanya, value=amountIn ETH). Reverse-engineer router custom = revert 5x + buang 30 menit; API resmi sekali coba langsung jalan. Flow: quote → sign → broadcast → cek balance token → approve → mint. **Jangan rebuild calldata dari API — sign as-is.**
17. **Agent yang cari jalur beli token SENDIRI — JANGAN suruh operator suapin** (operator: "lo yg belajar eksekusi masa gw suapin" 2026-08-16): kalau mint butuh beli token (burn-mechanic), agent wajib nemuin buy-route sendiri (API platform resmi, DEX, dll) — jangan bilang "lo beli manual di situsnya dulu". Operator minta eksekusi penuh dari agent. Hanya minta bantuan operator kalau jalurnya beneran butuh UI/browser (mis. gate interview manual).
18. **SEBELUM upload skill/scripts ke GitHub public: redact dulu** (2026-08-17): audit secret dulu — Alchemy API keys (`alch_...`) sering ke-hardcode di scripts, wallet addresses asli di references. Jalankan `scripts/redact-skill.py` (bikin salinan `~/nft-skill-public/` bersih, key → `[YOUR_ALCHEMY_KEY]`, wallet → `0x[YOUR_WALLET_ADDRESS]`), verifikasi 0 secret tersisa, BARU upload. Skill asli di VPS tetap utuh. GitHub upload via `gh auth login` (paste token di VPS, jangan di chat) → `gh repo create <nama> --public --source . --push`.
16. **SeaDrop-looking mint that reverts "could not decode result data" = OpenSea drops-API managed** (Cyclops Eyrix 2026-08-15) — plain `mintPublic` sim fails on every wallet even unminted; real txs go through a wrapper with embedded server signature. Don't grind the direct path: check `GET /drops/{slug}` (200 + active_stage = use drops API, key is in `.env`), or mint manually in UI. `references/opensea-drops-api-recon-detect.md`.
17. **Never assume the OpenSea key is "still pending"** — the dashboard key was approved 2026-08-15 and drops-API minting is PROVEN. Check `.env` for `OPENSEA_API_KEY` before concluding it's unavailable; re-request via dashboard only if it's actually missing/expired.
18. **Token-burn paid in launch-platform token: cek SUPPLY NFT DULU sebelum beli token** (Pool's Closed 2026-08-16) — beli 104K `$CLOSED` + approve sukses, tapi `mint()` revert `0x52df9fe5` (ExceedsMaxSupply) karena supply 1000/1000 udah sold out → token kebeli sia-sia (~$6). Baca `totalSupply()` vs `maxSupply()` di kontrak NFT sebelum beli burn-token; kalau deket cap, lapor & skip. Detail: `references/token-burn-platform-swap-api.md`.
19. **Jangan reverse-engineer DEX router kalau platform token punya swap API resmi** (Pool's Closed) — swap manual via router custom (`0x86ca0dc0` execute) revert berkali-kali; platform pools.fun punya `POST https://api.bankr.bot/pools-fun/swap/quote` yang langsung balikin `{tx:{to,data}}` siap-sign (sama kayak drops API — sign apa adanya, jangan rebuild calldata). Cari di JS situs platform: `swap/quote`, `swap/prepare`, `api.`. Detail: `references/token-burn-platform-swap-api.md`.
18. **Drops-API 409 "Drop is not currently active" ≠ dead — re-check drop config FIRST (Dirty Degen 2026-08-15):** a 409 on `POST /drops/{slug}/mint` mid-session usually means the STAGE changed (free→paid flip, or stage ended/replaced), not that the collection is dead. Sequence that burned time: recon showed `price:0` + `is_minting:true`, then minutes later all 15 wallets got 409; re-fetch `GET /drops/{slug}` showed `is_minting:null` momentarily then `price:0.025 ETH` on-chain. Rule: on 409 → re-fetch drop + `getPublicDrop` fresh; if price flipped → report to operator, DO NOT auto-pay (price-flip guard). Also note `is_minting` in the drops API response can flap (null/true) — trust on-chain `getPublicDrop`, not the API boolean.
20. **WETH canonical Robinhood = `0x[YOUR_WALLET_ADDRESS]`** (420K holders — jangan ketipu copy-an "wETH" yang <200 holders, ada banyak di Blockscout search). Unwrap WETH→ETH = call `withdraw(amount)` di kontrak WETH (nonpayable, sim dulu, gasLimit 150k). Setelah mint/swap yang sisain WETH, unwrap semua wallet biar balance siap mint berikutnya. Script: `scripts/weth-unwrap.js`.
21. **Alchemy free tier `eth_getLogs` cuma 10-block range** — `fromBlock: 0` → 400 error. Buat mapping token ID → wallet (holdings/verifikasi mint): (a) scan receipt tx mint kita (Transfer event: topics[1]=0x0 = mint, tokenId di topics[3], receiver di topics[2] — WASPADA case-mismatch: lowercase address constant sebelum compare); (b) Blockscout `/api/v2/addresses/{wallet}/nft` (token_id kadang null — gak selalu reliable); (c) OpenSea holdings `GET /api/v2/chain/robinhood/account/{addr}/nfts` + filter `contract` field (paling bersih buat koleksi indexed — dipake `scripts/nft-sell.js`).
19. **Verify harga/mekanik di website Next.js/SPA (MothBroker 2026-08-17):** HTML statis = RSC payload kosong ("This page could not be found" di body), konten dirender client-side. Cara: extract semua `src="/_next/static/...js"` dari HTML → download semua chunk → grep hardcoded config (`a3="0.00025"` style: MAX_SUPPLY/MINT_PRICE/MAX_PER_WALLET ada plaintext) + string translations chunk (FAQ/rules text = sumber kebenaran mekanik tambahan kayak burn refund & raffle pool). Ini yang ngejawab "site bilang dapet $4.7" = Lucky Pool 0.0025 ETH/batch, bukan harga mint.
20. **eth_getLogs Alchemy free tier = max 10-block range (MothBroker 2026-08-17):** buat verifikasi token ID mint fleet, JANGAN getLogs range besar (400 "Under the Free tier... 10 block range"). Cara bener: hash tx mint ada di log script (`grep -oP '0x[0-9a-f]{64}' <mint-log> | sort -u`) → `getTransactionReceipt` per hash → parse event `Transfer(from=0x0)` → `tokenId = topics[3]` → batch = `floor((tokenId-1)/batchSize)+1`. GOTCHA: lowercase KEDUA sisi address — `l.address.toLowerCase() === CA` (CA const uppercase) = gak pernah match, keliatan kayak "0 mint events" padahal semua ada. Blockscout `/tokens/{h}/transfers` & `/addresses/{h}/token-transfers` juga sering 422 — jangan buang waktu, receipt-decode aja. ethers MODULE_NOT_FOUND di mint-wallets → `NODE_PATH=$(dirname $(find / -path "*/node_modules/ethers/package.json" 2>/dev/null | head -1))/..`.
19. **Blockscout Robinhood chain domain = `robinhoodchain.blockscout.com`** (2026-08-17, MothBroker recon): `robinhood.blockscout.com/api/v2/...` balikin HTTP 404 "default backend - 404" — domain asli buat API v2 adalah `robinhoodchain.blockscout.com` (`/api/v2/addresses/{addr}` + `/api/v2/smart-contracts/{addr}`; field `abi` di respons SUDAH berupa list, bukan JSON string). Cara cari domain dari HTML site: `grep -oP 'href="[^"]*blockscout[^"]*"'`.
20. **`require('ethers')` MODULE_NOT_FOUND dari mint-wallets** (2026-08-17): node_modules di `/home/ubuntu/mint-wallets` kosong/hilang — JANGAN `npm install` ulang; cari install ethers yang udah ada (`find / -maxdepth 7 -path "*/node_modules/ethers/package.json" 2>/dev/null`) lalu jalankan dengan `NODE_PATH=<dir>/node_modules node script.js`. Catatan: `NODE_PATH` gak ngefek buat `node -e` eval (modul tetap gak ketemu) — tulis script ke file dulu, baru run.
21. **Direct-contract payable mint (`mint(uint256)` di NFT contract, non-SeaDrop)** — pattern proven MothBroker 30/30 + 15/15 (2 run, 2026-08-17): baca `MINT_PRICE()` on-chain fresh sebelum eksekusi (price-flip guard — bandingin expected), precheck `mintedCount(wallet)` vs MAX_PER_WALLET + balance ≥ price×qty+gas per wallet, sim tiap wallet, broadcast PARALLEL (Promise.all), verify receipt + re-read `mintedCount` on-chain semua wallet. Gas riil: 176.8K (qty 2) / 94.6K (qty 1), gasLimit 400k aman, value = price×qty. Template: `templates/direct-contract-payable-mint.js`.
22. **Merkle proof API: `proofs` BISA nested, pakai `proof` flat (RWAKERS 2026-08-18)** — beberapa site (rwakers.xyz `/api/proof/<wallet>`) balikin DUA field: `proofs` (array berisi 1 elemen yang isinya array — nested!) dan `proof` (flat array string hex). encodeFunctionData('mint(uint256,bytes32[])', [qty, proofs]) REJECT kalau dapet nested. Selalu pakai `d.proof` (flat), fallback `d.proofs.flat()`. Cek dulu struktur JSON-nya (`type elemen`), jangan asumsi.
23. **Overloaded `mint()` — ethers butuh selector EKSPLISIT** (RWAKERS 2026-08-18): contract punya `mint(uint256)` DAN `mint(uint256,bytes32[])` → `encodeFunctionData('mint', ...)` lempar "ambiguous function description". Wajib tulis signature lengkap: `'mint(uint256)'` / `'mint(uint256,bytes32[])'`. Ini beda dari kebanyakan contract yang cuma punya 1 overload.
24. **Eligibility check via PUBLIC merkle tree JSON (Bunkerhood 2026-08-18)** — site mint (Next.js) sering serve allowlist tree sebagai file JSON publik: cek `/allowlists/<name>-tree.json` (format `{root, proofs: {addr: [proof...]}}`). Download + cek SEMUA wallet langsung di dict — jauh lebih cepat dari ngecek satu-satu. GTD/WL tree bisa gede (23K+ entries = 24MB). Contract unverified + "COLLECTION UNAVAILABLE" + phase CLOSED/DISABLED = jangan gas dulu.
22. **ethers v6 overloaded function = WAJIB full signature** (RWAKERS 2026-08-18): contract punya `mint(uint256)` DAN `mint(uint256,bytes32[])` → `encodeFunctionData('mint', ...)` error `ambiguous function description`. Selalu tulis selector lengkap: `'mint(uint256)'` / `'mint(uint256,bytes32[])'`. Hal yang sama berlaku buat semua contract dengan function overload.
23. **Eligibility API bisa punya 2 field proof (RWAKERS 2026-08-18):** `/api/proof/<wallet>` balikin `proofs` (NESTED: `[["0x...","0x..."]]` — 1 elemen berisi array) DAN `proof` (FLAT: `["0x...","0x..."]` — langsung bisa dipake). Pakai `proof` dulu, fallback `proofs.flat()`. Salah pilih → ethers error `invalid BytesLike value` (mikir array 9-elemen itu bytes32 tunggal). Selalu `console.log` struktur respons API sekali sebelum encode.
24. **💰 COST-SENSITIVITY (HARD RULE 2026-08-18, operator: "30\$ itu banyak lho, harga mintprice sama floor tidak bersahabat"):** operator 2x kecewa di hari yang sama karena total biaya mint ($28-30) gak sebanding value (floor jelek/nggak ada). Sebelum fire PAID mint multi-wallet: (a) hitung TOTAL $ semua wallet + gas DAN sebutin di laporan, (b) cek floor/secondary value kalau collection udah ada (OpenSea / collection API) — kalau floor ≈ mint price atau di bawahnya, KASIH TAU eksplisit "mint price vs floor gak bersahabat" sebelum gas, (c) kalau operator tetep gas, jalanin — tapi jangan pernah biarin total $ keluar tanpa angka jelas di depan mata. Free mint / harga receh (<$1/NFT) gak perlu ritual ini.
22. **ethers v6 overloaded `mint` = "ambiguous function description"** (RWAKERS 2026-08-18): kalau contract punya `mint(uint256)` DAN `mint(uint256,bytes32[])`, `encodeFunctionData('mint', ...)` THROW ambiguous. WAJIB full signature string: `'mint(uint256)'` / `'mint(uint256,bytes32[])'`.
23. **Merkle proof API: field `proof` FLAT vs `proofs` NESTED** (RWAKERS `/api/proof/<addr>` 2026-08-18): banyak API kasih DUA field — `proofs` = array berisi 1 array (nested, gak bisa langsung dipake) dan `proof` = flat array siap-sign. Ambil `d.proof` DULU, fallback `d.proofs.flat()`. Nested ke ABI = "invalid BytesLike value" cryptic.
24. **`wallets.json` = DICT, bukan list** (RWAKERS 2026-08-18): format `{"1": {address, label, env, status}, ...}`. Parser wajib handle: dict (sort by numeric key), list of strings, list of objects. Salah parse = "0 wallet terdaftar" diam-diam.
25. **Bytecode scam scan WAJIB push-aware** (RWAKERS 2026-08-18): naive byte-scan buat SELFDESTRUCT `0xff`/DELEGATECALL `0xf4` = banyak false positive karena byte itu muncul di operand PUSH1-32 (address/hash constants). Bener: iterasi bytecode, kalau ketemu `0x60-0x7f` (PUSH1..PUSH32) → skip operand `1+(b-0x5f)` bytes, baru cek opcode sisanya. Kasus nyata: runtime 10,621 bytes / 1,764 PUSH → naive 232× `0xff` = SEMUA data; push-aware = 0 SELFDESTRUCT asli ✅.
26. **Allowlist tree JSON publik = cek eligibility TANPA connect wallet** (Bunkerhood 2026-08-18): banyak project host merkle tree publik (`/allowlists/gtd-tree.json`, `/allowlists/wl-tree.json`). Download + cek `addr.lower() in proofs` = jawaban instan buat SEMUA wallet sekaligus, tanpa UI/connect/sim. Bunkerhood: 0/15 wallet di GTD (1,346 entry) & WL (23,576 entry) → skip, gak ada public lane. Ground-truth eligibility sebelum janji.
27. **Paid mint = budget sensitivity operator** (RWAKERS 2026-08-18, operator: "30$ itu banyak lho" setelah 2 mint gak sesuai ekspektasi): operator anggap ~$30 SIGNIFIKAN. Sebelum gas paid mint: sajikan TOTAL $ + per-NFT + flag kalau floor/mintprice ratio gak bersahabat. Jangan asumsikan sepeser. Gas cuma kalau operator udah liat angka & setuju.
22. **ethers v6 overloaded function = "ambiguous function description" (RWAKERS 2026-08-18):** kalau contract punya `mint(uint256)` DAN `mint(uint256,bytes32[])`, `encodeFunctionData('mint', ...)` error INVALID_ARGUMENT "ambiguous function description". WAJIB pakai selector eksplisit: `encodeFunctionData('mint(uint256)', [qty])` atau `'mint(uint256,bytes32[])'`. Juga: kalau overloaded, ABI `['function mint(uint256 qty) payable','function mint(uint256 qty, bytes32[] proof) payable']` di-parse ethers jadi dua entri — panggil dengan nama lengkap.
23. **`wallets.json` bisa dict-of-objects BUKAN array (RWAKERS 2026-08-18):** format `{"wallets": {"1": {"address","label","env"}, ...}}` — parser yang cuma handle `Array.isArray` bakal balikin 0 wallet. Handle dua-duanya: dict → sort key numerik (`Number(a)-Number(b)`) biar index wallet konsisten dengan .env `wallet-N/`.
24. **API proof field bisa NESTED (`proofs` = array-of-array) vs FLAT (`proof` = array of hex) (RWAKERS 2026-08-18):** `/api/proof/<addr>` balikin dua field — `proofs` (1 elemen yang isinya array lagi, gak bisa langsung di-encode) dan `proof` (flat, siap pakai). Ambil `d.proof` dulu; fallback flatten `d.proofs.flat()`. Encode nested → `invalid BytesLike value`.
22. **ethers v6 overloaded function = "ambiguous function description"** (RWAKERS 2026-08-18) — kalau ABI punya dua `mint` overload (`mint(uint256)` + `mint(uint256,bytes32[])`), `encodeFunctionData('mint', args)` LEMPAR `ambiguous function description`. Wajib pakai signature penuh: `encodeFunctionData('mint(uint256,bytes32[])', [qty, proof])`.
23. **Merkle tier API: `proofs` NESTED vs `proof` FLAT** (RWAKERS 2026-08-18) — `/api/proof/<wallet>` balikin `{tier, listed, price, proofs, proof}`: `proofs` = array berisi 1 array (nested, `d.proofs[0]` = list 9 item), `proof` = array flat siap pakai. Pakai `d.proof || d.proofs.flat()`. Salah pilih → `invalid BytesLike value`.
24. **Bytecode SELFDESTRUCT scan = false positive kalau gak push-aware** (RWAKERS 2026-08-18) — grep mentah `0xff` di runtime bytecode nemu 232 "SELFDESTRUCT" padahal itu cuma operand PUSH32 (address/hash ke-embed). Scanner harus skip operand tiap PUSH1-PUSH32 (0x60-0x7f → lompat 1..32 byte) baru cek opcode. RWAKERS hasilnya bersih (cuma EXTCODEHASH = normal buat royalty/metadata).
25. **wallets.json = DICT keyed "1".."15", bukan list** (RWAKERS 2026-08-18) — format `{leader, wallets: {"1": {address, label, chain, env, status}, ...}}`. Parser wajib sort key numerik + baca `.address`. Salah asumsi format → "0 wallet terdaftar" / `unsupported addressable value`.
22. **Overloaded mint function + ethers v6 = "ambiguous function description" (RWAKERS 2026-08-18):** contract yang punya `mint(uint256)` DAN `mint(uint256,bytes32[])` → `encodeFunctionData('mint', [...])` throw INVALID_ARGUMENT. WAJIB pake selector penuh: `'mint(uint256)'` atau `'mint(uint256,bytes32[])'`. Juga: jangan `require('dotenv')` dari NODE_PATH — baca `.env` via fs + regex (dotenv gak selalu ada di node_modules pool).
23. **API proof nested vs flat (RWAKERS 2026-08-18):** `/api/proof/<addr>` balikin DUA field: `proofs` = NESTED (`[[h1..h9]]`, 1 elemen berisi array) dan `proof` = FLAT (`[h1..h9]`). Ambil `proof` dulu, fallback `proofs.flat()`. Salah ambil → ethers `invalid BytesLike value`. Cek struktur API dulu via curl sebelum encode.
24. **Scan bytecode opcode = false positive dari PUSH operand (RWAKERS 2026-08-18):** naive `grep 0xff` di runtime bytecode nemu "232 SELFDESTRUCT" padahal itu byte `0xff` di dalam operand PUSH32 (data konstan), BUKAN opcode. Scan yang bener: iterasi byte, kalau 0x60-0x7f (PUSH1..32) → skip `1 + (b-0x5f)` byte operand, baru cek opcode. Hasil bersih RWAKERS: cuma EXTCODEHASH (aman), 0 SELFDESTRUCT/DELEGATECALL.

## Support files added 2026-08-18 (RWAKERS, KOH, TokenRouter)

- `references/rwakers-mint-on-transaction-race.md` — **mint yg buka "on a transaction, not a countdown" (RWAKERS 2026-08-18, 31 NFT 15/15)**: gak ada T-0 publik → pre-sign semua tx → poll `mintOpen()` tiap 1.5s → fire paralel pas flip. Free tier = merkle proof dari `/api/proof/<wallet>` (pakai field `proof` FLAT, BUKAN `proofs` yang nested!). ethers v6 overloaded `mint` WAJIB selector eksplisit `mint(uint256,bytes32[])`. wallets.json = dict keyed `"1":{address,label,env}` (bukan array). PK di `wallet-<N>/.env` (`PRIVATE_KEY=`).
- `references/opensea-drops-stage-scheduling.md` — **drops API multi-stage scheduling (KOH 2026-08-18)**: `GET /drops/{slug}` → `stages[]` berisi stage MASA DEPAN (public sale start_time, price "0", max_per_wallet) + `active_stage` skrg. Pre-position race: poll sampai `active_stage.stage_type === 'public_sale'` && `price === '0'` → fetch calldata SEMUA wallet paralel → broadcast paralel. Price-guard FREE.
- `references/merkle-tree-eligibility-offline.md` — **cek eligibility TANPA connect wallet (Bunkerhood 2026-08-18)**: banyak claim site expose `/allowlists/gtd-tree.json` + `/allowlists/wl-tree.json` → download & cek keanggotaan lokal (GTD 1.3K entry, WL 23K entry). Contract unverified → ABI & logika ada di Next.js page chunk (`page-*.js`) — grep `merkleRoot|mint(stageId|InvalidMerkleProof`. Frontend pin bytecode hash contract identity.

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
| **PoW mining game (proof-of-luck, round+ticket)** | No (on-chain verify) | ✅ grind → submitWork → claim | MINECAT — `references/pow-mining-game-mint.md` |
| **ERC-8004 agent registry (identity NFT)** | No (public) / merkle proof (list/free tier) | ✅ Yes | RWAKERS — `references/rwakers-erc8004-agent-registry-mint.md` |
| **ERC-8004 agent-registry mint (mintOpen-poll auto-fire)** | No | ✅ pre-sign → poll `mintOpen()` → fire paralel | RWAKERS 15/15 — `references/rwakers-erc8004-auto-fire.md` |
| Multi-trial puzzle (commit/reveal) | On-chain hash | Solve→commit→reveal | Inference Angels — `references/inference-angels-puzzle-mint.md` |
| Global-window free mint | No | ✅ Yes (raced) | Rentoids — `references/global-window-race-full.md` |
| **Open-on-tx mint (no countdown, `mintOpen()` poll)** | No | ✅ pre-sign + poll + fire | RWAKERS 15/15 — `references/mintopen-poll-race.md` |
| Phase-gated direct mint | No | ✅ Yes | BTC MACHINES — `references/mint-site-config-js-recon.md` |
| **Merkle-tier registry mint (`mintOpen()` poll + pre-sign race)** | Merkle proof utk list/free tier | ✅ Yes (pre-sign) | RWAKERS — `references/merkle-tier-registry-mint.md` |
| **Flag-flip poll race (`mintOpen` bool — opens on a tx, no countdown)** | No | ✅ pre-sign ALL → poll flag → parallel fire | RWAKERS 15/15 — `references/rwakers-flag-flip-race.md` + `templates/flag-flip-poll-race.js` |
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
- `references/rwakers-agent-registry-mint.md` — **RWAKERS (ERC-8004 agent registry, RH 4663)**: contract addr, tiers (public 0.0005/list 0.00025/free), MAX_PER_TX 5 / MAX_PER_WALLET 10, API `/api/collection` `/api/chain` `/api/proof/<addr>`, race tanpa countdown (poll `mintOpen`), proof nested-vs-flat quirk, status wallet 1 free + 2-15 public, script `/home/ubuntu/mint-wallets/rwakers-race.js`
### References (canonical)
- `references/rwakers-flag-flip-race.md` — **flag-flip poll race (RWAKERS 2026-08-18, VERIFIED 15/15)**: mint buka via `setMintOpen` (bukan countdown) → pre-sign semua → poll flag → parallel fire; ERC-8004 agent registry, merkle tier API `/api/proof/<wallet>` (`proof` flat vs `proofs` nested), ethers overloaded sig, wallets.json dict format, bytecode push-aware scan, tokenId decode dari Transfer events
- `references/platform-token-buy-mint.md` — token-burn mint: beli token via API resmi platform (pools.fun → api.bankr.bot, quote → sign-as-is → approve → mint); jangan reverse-engineer router
- `references/osnm-z-eval.md` — **evaluasi 2 tool komunitas (2026-08-16)**: OSNM-Z (Rust, mint OpenSea tanpa API key via SIWE — TAPI cuma 1-stage, cadangan darurat) + nft-public-mint/Morsy (duplikat seadrop-race-v3 kita, connection-warmer gak worth). Pola evaluasi tool: bedah kode → bandingkan toolkit → duplikat? jangan install, catat aja
- `references/tool-eval-osnm-nft-mint.md` — eval detail OSNM-Z & nft-public-mint: batasan 1-stage, connection-warmer minim, veredict cadangan doang
- `references/token-burn-platform-swap-api.md` — **token-burn paid in launch-platform token** (Pool's Closed): cek SUPPLY NFT dulu sebelum beli token (sold-out trap `0x52df9fe5`), pakai platform swap API (`api.bankr.bot/pools-fun/swap/quote` → `{tx:{to,data}}` siap-sign), jangan reverse-engineer router custom; cara nemu platform swap API dari JS
- `scripts/redact-skill.py` — **redact skill sebelum upload GitHub public**: bikin salinan `~/nft-skill-public/` bersih (Alchemy keys → `[YOUR_ALCHEMY_KEY]`, wallet addr → `0x[YOUR_WALLET_ADDRESS]`, PK 64hex → dummy); skill asli di `~/.hermes/skills/` TIDAK disentuh. Jalankan sebelum `gh repo create --public`. Verifikasi: `grep -rhoE "alch_[A-Za-z0-9]{8,}" ~/nft-skill-public/ | wc -l` harus 0
- `references/poolsfun-token-burn-mint.md` — **token-burn via API resmi platform (pools.fun/api.bankr.bot)**: flow quote → sign tx as-is → approve → mint + sell-back; JANGAN reverse-engineer router custom
- `references/mintopen-poll-race.md` — **mint open-on-tx (RWAKERS 15/15)**: poll `mintOpen()` + pre-sign + parallel fire; pitfalls (overloaded mint selector ethers v6, `proofs` nested vs `proof` flat, wallets.json dict); **eligibility check via public merkle tree** (Bunkerhood: 0/15 → skip)
- `references/erc8004-agent-registry-mint.md` — **ERC-8004 agent-registry mints (RWAKERS 2026-08-18)**: NFT = onchain-computed agent certificate, art redrawn from agent record; mint opens via owner `setMintOpen` tx BUKAN countdown (gak bisa pre-position, poll `mintOpen`); tier merkle TIER_PUBLIC/LIST/FREE (freeCap/discountCap); recon recipe (llms.txt → /api/collection → /api/proof/<wallet> → Blockscout ABI → on-chain state); list besar = mayoritas wallet tier public; rarity deterministik dari tokenId (bukan roll)
- `scripts/scan-bytecode-opcodes.py` — **push-aware EVM bytecode scanner** (anti-false-positive): skip operand PUSH1-32 sebelum cek opcode SELFDESTRUCT/DELEGATECALL/CALLCODE/EXTCODEHASH; `python3 scripts/scan-bytecode-opcodes.py <rpc> <CA>` (rpc optional → auto dari ALCHEMY_KEY_1); exit 0 = clean
- `references/merkle-tier-registry-mint.md` — **merkle-tier registry mint (RWAKERS, VERIFIED 15/15)**: contract `mintOpen()` + `mint(uint256)`/`mint(uint256,bytes32[])` tiers (free/list/public), recon via /llms.txt + /api/collection + /api/proof/<wallet>, pre-sign + poll + auto-fire race script, overloaded-fn full-signature gotcha, `proofs` nested vs `proof` flat gotcha, eligibility via public merkle tree JSON (Bunkerhood gtd-tree.json/wl-tree.json), cost-vs-floor check rule
- `references/rwakers-erc8004-agent-registry-mint.md` — **ERC-8004 agent registry mint (RWAKERS, VERIFIED 15/15)**: mint via 3-contract stack, overloaded `mint(uint256)`/`mint(uint256,bytes32[])`, `/api/proof` tier check (proofs nested vs proof flat), mintOpen polling race (no countdown)
- `references/mint-route-playbook.md` — **nemuin jalur mint di website BARU (wajib baca saat recon)**: decision tree SeaDrop/direct/API/token-burn, cari CA di RSC payload, ground-truth = decode tx sukses asli, pitfalls route
- `references/blockscout-recon-api.md` — **Blockscout v2 API recon Robinhood Chain**: domain BENAR `robinhoodchain.blockscout.com` (yang `robinhood.` 404 "default backend"), endpoint ABI (`abi` = LIST, jangan json.loads), baca MINT_PRICE on-chain, workaround ethers MODULE_NOT_FOUND via `NODE_PATH=/tmp/neon-sign/node_modules`, contoh MothBroker (burn-refund 80% + batch raffle)
- `references/osnm-z-fallback-tool.md` — **OSNM-Z Rust CLI (fallback mint OpenSea tanpa API key)**: SIWE auth, multi-wallet; LIMITASI: cuma 1-stage aktif; sponsored/EIP-7702 JANGAN dipake; installed di `~/tools/osnm-z/`
- `references/game-gated-mint.md` — **game-gated mint (play-to-mint, SPAWNHOOD)**: HTML5 game + server voucher, MANUAL only — agent gak bisa main game; cek getCode(ownerAddr) buat tau live/belum

- `references/revoke-approvals.md` — revoke approvals after every project (operator rule, pernah ke-drain)
- `references/gameplay-gated-mint.md` — play-to-mint arcade (SpawnHood): canvas game + server voucher, anti-bot, butuh human; deteksi via game.js mint ABI + getCode owner

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
- `references/tanstack-start-claim-site-access.md` — **claim-site eligibility check (TanStack Start)**: server fn di `/_serverFn/<hash>` + header `x-tsr-serverFn: true`; cara extract hash dari JS bundle; format body `{"data":...}`; decode Seroval response; pitfall Cloudflare bot management (POST sensitif 500 dari IP datacenter → fallback call dari page context browser asli)
- `references/robinhood-weth-unwrap.md` — **canonical WETH RH chain** `0x[YOUR_WALLET_ADDRESS]` (cek holders_count buat bedain copy-an) + unwrap withdraw(); token-ID enumeration 3 cara (OpenSea holdings API, scan receipt Transfer events, Alchemy getLogs 10-block limit); approval hygiene conduit vs Seaport
- `references/rwakers-erc8004-auto-fire.md` — **RWAKERS 15/15 (2026-08-18)**: ERC-8004 agent-registry mint, mint opens on TX (bukan countdown) → poll `mintOpen()` + pre-sign + auto-fire paralel; `/api/collection`, `/api/chain`, `/api/proof/<addr>` (field `proof` FLAT vs `proofs` NESTED); bytecode push-aware scan; hasil 31 NFT dari 120 supply
- `references/merkle-tree-eligibility-check.md` — **cek eligibility via publik merkle tree JSON (Bunkerhood 2026-08-18)**: site Next.js publish tree di `/allowlists/gtd-tree.json` + `/wl-tree.json` → download + membership check tanpa connect wallet; ABI dari page chunk kalau contract belum verified; `CONTRACT BLOCKED` bytecode-hash pinning; hasil 0/15 → SKIP
- `references/wl-stage-supply-drain.md` — **WL stage gratis sebelum public = supply drain (Knights of Hood 2026-08-18)**: WL (max 3/wallet, ribuan alamat) nyedot 2,744 sisa dalam 1 jam → public buka di supply 0 → 15/15 calldata 422 "Drop is fully minted out" (verified totalSupply 5000/5000). Cek eligibility SEMUA stage dari awal (drops API `stages[]`), jangan cuma target public
- `scripts/bytecode-opcode-scan.py` — **push-aware EVM opcode scan**: bedain SELFDESTRUCT/DELEGATECALL asli dari byte 0xff/0xf4 di operand PUSH32 (naive grep = false positive 232x di RWAKERS); usage `python3 bytecode-opcode-scan.py 0x<CA>` atau `--file`/`--offline`
- `references/batch-raffle-prize-claim.md` — **batch-raffle NFT (MothBroker)**: cek `prizes(batch)` per batch vs fleet → kalau menang CLAIM CEPAT (window 72h, expired = swept); ABI 5-field bukan 6; claimPrize nonpayable
- `references/robinhood-weth-unwrap.md` — **WETH canonical RH chain** = `0x[YOUR_WALLET_ADDRESS]` (420K holders, lainnya copy-an); unwrap via `withdraw()`; script `mint-wallets/weth-unwrap.js` idempoten
- `references/tanstack-start-serverfn-claims.md` — **claim/eligible site TanStack Start**: call server fn langsung (`POST /_serverFn/<fnId>` + header `x-tsr-serverFn: true`, body `{"data":...}`); cara dapet fnId dari bundle; pitfall Cloudflare bot block di POST claim → butuh browser context
- `references/pow-mining-game-mint.md` — **proof-of-luck PoW mining game (MINECAT)**: keccak256(seed‖addr‖nonce), ticket/lucky target, round+openRound+ticket mechanic, selectors, CLI miner resmi, pitfall "hash above target" = round rollover, audit miner checklist, GPU route (WebGPU bukan CUDA, Vast.ai no-KYC + USDC)
- `references/tanstack-start-serverfn-recon.md` — **TanStack Start claim sites**: `/_serverFn/<hash>` + header `x-tsr-serverFn: true`, body `{"data":...}` (Seroval = JSON biasa), "Seroval Error step 3" = CF bot block, sign lokal + page-context fetch kalau POST diblok
- `references/pow-mining-game-mints.md` — **proof-of-luck keccak mining game (MINECAT)**: 60-byte PoW spec, round/ticket mechanic, submitWork gratis vs claim bayar, miner audit (no-approve = aman), fleet supervisor, round-rollover pitfall, GPU vs CPU economics
- `references/tanstack-start-serverfn-recon.md` — **TanStack Start claim-site recon**: `/_serverFn/<hash>` + header `x-tsr-serverFn: true`, body `{"data":...}` JSON polos, map export-map bundle → fn ID, CF bot-block pada POST = stop & lapor
- `references/proof-of-luck-pow-mint.md` — **MINECAT proof-of-luck keccak PoW mining** (gak bisa beli, harus mine): PoW = keccak256(seed32‖addr20‖nonce8) < ticketTarget; submitWork free, claim ~0.000106 ETH; 5/wallet · 50 slot/round · round ~60s; official CLI miner `minecat-miner.zip` + contract selectors + VPS benchmark (2-core ≈ 63 kH/s/thread ≈ 2.8 min/solusi)
- `references/tanstack-start-serverfn-recon.md` — **eligibility/claim check di situs TanStack Start**: server fn di `/_serverFn/<id>` + header `x-tsr-serverFn: true`; GET publik jalan, POST claim ke-proteksi Cloudflare bot management (signature: 500 `Seroval Error (step: 3)` di SEMUA body) → BAIL-EARLY, jangan grind, lapor + cleanup (operator mandate 2026-08-17)
- `references/seaport-listing-sell-flow.md` — **SELL via Seaport 1.6 (VERIFIED MothBroker)**: RH chain Seaport addr beda dari mainnet, OpenSea conduit gak deployed → zero-conduit + approve Seaport, EIP-712 types, BigInt replacer, holdings via receipt-scan (Alchemy getLogs free-tier 10-block limit), OpenSea 404 = koleksi belum ke-index → lapor jujur, Blockscout endpoint mana yang work vs 422, NODE_PATH ethers

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
- `scripts/nft-sell.js` — **generic OpenSea Seaport listing (VERIFIED MothBroker 15/15)**: `node nft-sell.js <CA> <wallets> <qty> <priceEth> [--dry-run]`; wallets = single/list/range/all; token IDs auto-detect dari OpenSea holdings; approve conduit + sign + POST + verify. Resep lengkap di rule SELL VIA AGENT COMMAND.
- `scripts/aliennode-mint.js` — **Alien Node agentic PoW mint (VERIFIED 15/15)**: `node aliennode-mint.js <wallets|all> <qty>`; puzzle → solve → sign lokal → submit (pola Neon Nodes, API `https://www.aliennode.tech/api`); solver handle: add/sub/mul/div/mod/squares/half/double/three-term/`Convert X to hexadecimal|binary|octal`; 0.0005 ETH/mint, max 20/wallet, batch ≤5, gasLimit 500k
- `scripts/weth-unwrap.js` — **unwrap WETH→ETH semua wallet (VERIFIED 14/14)**: baca balanceOf WETH canonical (`0x[YOUR_WALLET_ADDRESS]`) per wallet → `withdraw(wei)` → verify; idempoten (0 WETH = skip)
- `scripts/audit-all.js` — **audit approval menyeluruh**: NFT contracts (MOTH/Alien/MINECAT/PoolClosed) × operators [Seaport, Conduit] × 15 wallet + ERC20 allowance ($CLOSED→PoolClosedNFT, $BROKER→Undertaker). Jalanin SEBELUM revoke & SESUDAH buat verify bersih.
- `scripts/revoke-total.js` — **revoke total (VERIFIED 25/25 tx)**: cancel listing via Seaport `incrementCounter()` (wallet 11-15) → revoke conduit MOTH (15) + AlienNode (1-4) → approve 0 $CLOSED. Pattern cleanup project yang nyangkut/operator minta bersih total.
- `scripts/minecat-fleet.js` + `scripts/weth-unwrap.js` — **MINECAT fleet supervisor** (2 paralel × 15 wallet, log per wallet di `minecat-logs/`) dan **WETH unwrap** (canonical WETH `0x0Bd7...`); keduanya di `/home/ubuntu/mint-wallets/` (pola lengkap: `references/pow-mining-game-mints.md`)
- `scripts/weth-unwrap.js` — **WETH→ETH unwrap semua wallet (canonical WETH RH `0x0Bd7...AD73`)**: scan balance, sim, broadcast withdraw, verify; `--scan` = cuma liat tanpa unwrap. Dipake setelah mint/swap yang sisain WETH.
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
- `templates/direct-contract-payable-mint.js` — generic direct-contract payable mint `mint(uint256)` (MothBroker-proven 30/30 + 15/15): MINT_PRICE guard, mintedCount+balance precheck, sim, parallel broadcast, on-chain verify; env: NFT_ADDR, QTY, EXPECTED_PRICE_ETH, MAX_PER_WALLET
- `templates/flag-flip-poll-race.js` — **flag-flip poll race (RWAKERS-proven 15/15)**: pre-sign semua tx → poll `mintOpen()` tiap 1.5s → parallel fire pas flip; handle tier merkle (proof flat) + public (price×qty); price-flip guard; pakai full signature `mint(uint256,bytes32[])` (overload trap)
