#!/usr/bin/env node
/**
 * Merge Cats FREE-lane race — v7 (PROACTIVE wall-clock + dynamic window)
 * ================================================================
 * v6 (currentWindow-reactive) kalah terus karena tiap fire telat 100-200ms
 * (deteksi window naik butuh RPC round-trip, BARU arm). v1 dulu menang 46x
 * karena fire PROAKTIF pakai jam lokal pas boundary - LEAD.
 *
 * v7 = v1 (proaktif) + dinamis:
 *   - boundary = kelipatan freeWindow()*1000 dari epoch (jam lokal, NTP)
 *   - fire di boundary - LEAD (165ms) — TANPA nunggu deteksi RPC
 *   - re-read freeWindow() tiap 5 detik → period auto-update (5/10/24/1s)
 *   - fan-out broadcast paralel (v1 proven), balanceOf win-detection (v6 fix)
 */
const {ethers} = require('ethers');
const fs = require('fs');

const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const CATZ = '0x[YOUR_WALLET_ADDRESS]';
const CHAIN_ID = 4663;
const LEAD = 165;                    // ms sebelum boundary (v1 sweet spot -165ms)
const MAX_PER_WALLET = 10;
const TARGET_WALLETS = ['3','4','5','6','7','8','9','10']; // 1-2 keluar (dijual), 11-15 nyusul
const RPC_URLS = [
  'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp',
  'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]',
];
const MINT_SIG = '0x5b70ea9f';       // freeMint()
const GAS = { gasLimit: 250000, maxFeePerGas: ethers.parseUnits('0.5','gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01','gwei'), type: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const timeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);

const ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function freeWindow() view returns (uint256)',
  'function freeMinted() view returns (uint256)',
  'function freeCap() view returns (uint256)',
];

let pollIdx = 0;
const FAST_RPC = [1, 2]; // dua Alchemy key (cepat) — rotasi: 1 utama, 2 cadangan
let alchemyCooldownUntil = [0, 0]; // cooldown per-key kalau kena 429
const ALCHEMY_COOLDOWN_MS = 30000; // 30 detik jeda setelah kena 429

function alchemyAvailable(i) { return Date.now() >= alchemyCooldownUntil[i]; }

function mkProvider(i) { return new ethers.JsonRpcProvider(RPC_URLS[i], 4663, { staticNetwork: true }); }
function mkContract(i) { return new ethers.Contract(CATZ, ABI, mkProvider(i)); }

function isRateLimit(e) {
  const m = String(e.message || '') + String(e.shortMessage || '') + String(e.code || '');
  return /429|rate.?limit|exceeded.*capacity|capacity.*exceeded/i.test(m);
}

function handleRateLimit(i) {
  if (FAST_RPC.includes(i)) {
    alchemyCooldownUntil[i] = Date.now() + ALCHEMY_COOLDOWN_MS;
    console.log(`⚠️ Alchemy key#${i} 429 — cooldown 30s, pindah key lain`);
  }
}

async function callRpc(fn, arg, ms = 400) {
  // Urutan: alchemy#1 → alchemy#2 → canonical (skip yang lagi cooldown)
  const order = [...FAST_RPC.filter(alchemyAvailable), 0];
  for (let attempt = 0; attempt < order.length; attempt++) {
    const idx = order[attempt];
    try {
      const c = mkContract(idx);
      const v = arg !== undefined ? await timeout(c[fn](arg), ms) : await timeout(c[fn](), ms);
      if (v !== null) { pollIdx = idx; return v; }
    } catch (e) {
      if (isRateLimit(e) && FAST_RPC.includes(idx)) handleRateLimit(idx);
    }
  }
  return null;
}

async function readNonce(addr) {
  for (let attempt = 0; attempt < RPC_URLS.length; attempt++) {
    const idx = (pollIdx + attempt) % RPC_URLS.length;
    try {
      const p = mkProvider(idx);
      const n = await timeout(p.getTransactionCount(addr, 'pending'), 400);
      if (n !== null) return Number(n);
    } catch (e) {}
  }
  return null;
}

async function broadcast(signed) {
  // Fan-out ke semua RPC available — alchemy#1, alchemy#2, canonical (skip yg cooldown)
  const targets = RPC_URLS.map((_, i) => i).filter(i => !FAST_RPC.includes(i) || alchemyAvailable(i));
  const results = await Promise.allSettled(targets.map(async (i) => {
    try {
      const p = mkProvider(i);
      const h = await timeout(p.broadcastTransaction(signed), 700);
      return h ? {ok: true, hash: h.hash} : null;
    } catch (e) {
      const msg = String(e.message || '') + String(e.shortMessage || '');
      if (/already known|nonce too low|replacement|underpriced/i.test(msg)) return {ok: false, taken: true};
      if (isRateLimit(e) && FAST_RPC.includes(i)) handleRateLimit(i);
      return null;
    }
  }));
  const ok = results.filter(r => r.status === 'fulfilled' && r.value && r.value.ok);
  if (ok.length) return ok[0].value;
  const taken = results.find(r => r.status === 'fulfilled' && r.value && r.value.taken);
  if (taken) return {ok: false, taken: true};
  return {ok: false, taken: false};
}

async function main() {
  pollIdx = 0;
  try { await mkContract(0).freeWindow(); } catch (e) { pollIdx = 1; }

  // Sync on-chain
  const wallets = [];
  for (const id of TARGET_WALLETS) {
    const w = CONFIG.wallets[id];
    if (!w) continue;
    const env = fs.readFileSync(w.env, 'utf8');
    const pk = env.match(/^PRIVATE_KEY=(\S+)$/m)[1];
    if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) continue;
    let minted = null;
    try { minted = await callRpc('balanceOf', w.address); } catch (e) {}
    if (minted === null) { console.log(`wallet ${id}: balance gagal dibaca — SKIP`); continue; }
    minted = Number(minted);
    if (minted >= MAX_PER_WALLET) { console.log(`wallet ${id}: ${minted}/10 — skip`); continue; }
    const nonce = await readNonce(w.address);
    console.log(`wallet ${id}: ${minted}/10 | nonce ${nonce}`);
    wallets.push({id, address: w.address, pk, minted, nonce, pending: null, miss: 0, lastTry: 0});
  }
  let totalWins = wallets.reduce((s,w) => s + w.minted, 0);
  console.log(`🔥 ARM: ${wallets.length} wallet | PROAKTIF jam-lokal | lead ${LEAD}ms`);
  console.log(`🎯 Total on-chain: ${totalWins}/100`);

  // period awal dari kontrak
  let periodMs = 5000;
  const fw0 = await callRpc('freeWindow');
  if (fw0 !== null && Number(fw0) >= 1) periodMs = Number(fw0) * 1000;
  let lastFw = fw0 !== null ? Number(fw0) : 5;
  console.log(`📐 Window awal: ${lastFw}s (period ${periodMs}ms)`);

  let lastFwLog = Date.now();
  let lastFireLog = 0;
  let lastStateLog = Date.now();
  let lastSupplyLog = Date.now();
  let fireCount = 0;
  let lastBoundary = 0;
  let freeCap = null;
  let freeMintedNow = null;

  while (wallets.some(w => w.minted < MAX_PER_WALLET)) {
    const now = Date.now();

    // Cek supply free lane tiap 15 detik — STOP otomatis pas freeMinted >= freeCap (supply abis)
    if (now - lastSupplyLog > 15000) {
      const fm = await callRpc('freeMinted');
      const fc = await callRpc('freeCap');
      if (fm !== null) freeMintedNow = Number(fm);
      if (fc !== null) freeCap = Number(fc);
      if (freeMintedNow !== null && freeCap !== null) {
        console.log(`📦 Free lane: ${freeMintedNow}/${freeCap} (sisa ${freeCap - freeMintedNow})`);
        if (freeMintedNow >= freeCap) {
          console.log(`\n🏁 FREE LANE ABIS (${freeMintedNow}/${freeCap}) — SELESAI`);
          break;
        }
      }
      lastSupplyLog = now;
    }

    // Re-read freeWindow tiap 5 detik → period auto-update kalau project ganti window
    if (now - lastFwLog > 5000) {
      const fwNow = await callRpc('freeWindow');
      if (fwNow !== null) {
        const fwN = Number(fwNow);
        if (fwN >= 1 && fwN !== lastFw) {
          console.log(`🔁 WINDOW BERUBAH: ${lastFw}s → ${fwN}s — period ${fwN*1000}ms, auto-adaptif`);
          lastFw = fwN;
          periodMs = fwN * 1000;
        }
      }
      lastFwLog = now;
    }

    // Boundary berikutnya = kelipatan period dari epoch (proaktif, jam lokal)
    const boundary = now + (periodMs - (now % periodMs));
    const wait = boundary - now - LEAD;
    if (wait > 0) await sleep(wait);

    // FIRE di boundary - LEAD — PARALLEL semua wallet (biar 7 wallet < 1s, bisa nembak TIAP window)
    const fireTargets = wallets.filter(w => w.minted < MAX_PER_WALLET && !w.pending && Date.now() - w.lastTry >= 1200);
    if (fireTargets.length) {
      const results = await Promise.all(fireTargets.map(async w => {
        try {
          const signed = await new ethers.Wallet(w.pk).signTransaction({to: CATZ, data: MINT_SIG, value: 0n, chainId: CHAIN_ID, ...GAS, nonce: w.nonce});
          const r = await broadcast(signed);
          w.lastTry = Date.now();
          if (r.ok) { w.pending = {hash: r.hash, nonce: w.nonce}; w.miss = 0; return true; }
          if (r.taken) {
            const n = await readNonce(w.address);
            if (n !== null && n > w.nonce) w.nonce = n;
          }
          return false;
        } catch (e) { return false; }
      }));
      const fired = results.filter(Boolean).length;
      if (fired && Date.now() - lastFireLog > 3000) {
        console.log(`[${new Date().toISOString().slice(11,19)}] 🔥 ${fired} wallet (total fire ${++fireCount}) | period ${periodMs}ms`);
        lastFireLog = Date.now();
      }
    }

    // Cek receipt + balance win-detection (batasi: cuma tiap 1.5s biar hemat RPC)
    const pendingW = wallets.filter(w => w.pending);
    if (pendingW.length && now - (global._lastRcCheck || 0) > 1500) {
      global._lastRcCheck = now;
      const results = await Promise.all(pendingW.map(async w => {
        try {
          const p = mkProvider((pollIdx + 1) % RPC_URLS.length);
          return {w, rc: await timeout(p.getTransactionReceipt(w.pending.hash), 400)};
        } catch (e) { return {w, rc: null}; }
      }));
      for (const {w, rc} of results) {
        if (rc) {
          if (rc.status === 1) {
            w.minted++; totalWins++;
            console.log(`  🎉 wallet ${w.id}: WIN (${w.minted}/${MAX_PER_WALLET}) total ${totalWins}`);
            if (w.minted >= MAX_PER_WALLET) console.log(`  wallet ${w.id}: cap ${MAX_PER_WALLET} ✅`);
          }
          w.nonce = w.pending.nonce + 1; w.pending = null; w.miss = 0;
        } else {
          w.miss++;
          if (w.miss >= 3) {
            try {
              const bal = Number(await callRpc('balanceOf', w.address));
              if (bal > w.minted) {
                const gained = bal - w.minted;
                w.minted = bal; totalWins += gained;
                console.log(`  🎉 wallet ${w.id}: WIN x${gained} via balance (${w.minted}/${MAX_PER_WALLET}) total ${totalWins}`);
                if (w.minted >= MAX_PER_WALLET) console.log(`  wallet ${w.id}: cap ${MAX_PER_WALLET} ✅`);
              }
            } catch (e) {}
            const n = await readNonce(w.address);
            if (n !== null && n > w.pending.nonce) w.nonce = n;
            w.pending = null; w.miss = 0;
          }
        }
      }
    }

    if (Date.now() - lastStateLog > 60000) {
      console.log(`📊 [${new Date().toISOString().slice(11,19)}] window=${lastFw}s | pending=${wallets.filter(w=>w.pending).length} | wins=${totalWins}`);
      lastStateLog = Date.now();
    }
  }

  console.log('\n=== SELESAI ===');
  for (const w of wallets) console.log(`wallet ${w.id}: ${w.minted}/${MAX_PER_WALLET}`);
  console.log(`TOTAL: ${totalWins} free cats`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
