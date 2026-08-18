#!/usr/bin/env node
/**
 * SeaDrop FREE-mint RACE v3 — precision + drip-fire + adaptive RPC
 *
 * Upgrade dari v2 (berdasarkan pengukuran live Robinhood chain):
 *   1. Block cadence ~0.2s → poll-then-fire SELALU telat 3-4 blok.
 *      Solusi: fire presisi pakai jam lokal (NTP-synced) + offset terkalibrasi.
 *   2. RTT RPC sangat beda: canonical 299ms vs drpc 82ms vs Alchemy 76ms.
 *      Solusi: ukur RTT saat start, polling + fire lewat RPC tercepat, sisanya fan-out.
 *   3. Satu tembakan = judi timming. Solusi: DRIP-FIRE — pre-sign 3 nonce per wallet,
 *      tembak beruntun @ --drip-ms (default 200ms) nyapuin batas start.
 *      Yang ke-mine sebelum start → revert murah (~38k gas); yang abis start → menang.
 *   4. Warm connection + JSON-RPC batch: 10 tx dalam 1 POST per RPC.
 *
 * Usage:
 *   node seadrop-race-v3.js --nft 0x... --qty 10 [--lead 400] [--drip 200] [--nonces 3]
 *                          [--lead-wallets 5] [--wallets 1-10] [--calibrate]
 *
 * Catatan jujur: drip-fire + RPC pintar menutup gap kode, bukan gap geografi.
 * Bot US-East (30-50ms) masih punya keunggulan fisik ~1-2 blok di 0.2s cadence.
 */
const {ethers} = require('ethers');
const fs = require('fs');

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const SEADROP = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';
const FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719';
const CHAIN_ID = 4663;
const LOG = '/home/ubuntu/mint-wallets/seadrop-race-v3.log';

// ── Argumen ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NFT = getArg('--nft', '');
const QTY = parseInt(getArg('--qty', '10'));
const LEAD_MS = parseInt(getArg('--lead', '500'));      // mulai sweep berapa ms sebelum start
const DRIP_MS = parseInt(getArg('--drip', '200'));      // interval antar nonce
const NONCES = parseInt(getArg('--nonces', '4'));       // berapa nonce per wallet
const LEAD_WALLETS = parseInt(getArg('--lead-wallets', '5'));
const GAS_ARG = parseInt(getArg('--gas', '0'));         // gas limit override (0 = default 1.2M)
const WALLET_FILTER = getArg('--wallets', '').split(',').filter(Boolean);
const CALIBRATE = args.includes('--calibrate');
if (!NFT || !/^0x[0-9a-fA-F]{40}$/.test(NFT)) { console.error('❌ --nft wajib'); process.exit(1); }

// ── RPC: 2 jalur Alchemy (key#1 utama, key#2 cadangan) — canonical & drpc dibuang
const rpcs = getRpcs();
const RPC_LIST = [
  'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp',
  'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]',
  rpcs.primary,
].filter((v, i, a) => v && a.indexOf(v) === i);
const providers = RPC_LIST.map(u => new ethers.JsonRpcProvider(u));
const GAS_LIMIT = GAS_ARG > 0 ? BigInt(GAS_ARG) : 1200000n; // override via --gas, default 1.2M (qty besar: ~34k gas/NFT SeaDrop)

const seadropIface = new ethers.Interface([
  'function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable',
]);
const nftIface = new ethers.Interface([
  'function getMintStats(address) view returns (uint256,uint256,uint256)',
]);
const sdDropIface = new ethers.Interface([
  'function getPublicDrop(address) view returns (tuple(uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxLimitPerWallet, uint16 maxTokenSupplyForDrop, uint16 feeBps))',
]);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}
function readPk(envPath) {
  const env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^PRIVATE_KEY=(\S+)$/m);
  if (!m) throw new Error('PK not found in ' + envPath);
  if (!/^0x[0-9a-fA-F]{64}$/.test(m[1])) throw new Error('PK format invalid in ' + envPath);
  return m[1];
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Ukur RTT tiap RPC (eth_blockNumber) → urutkan tercepat
async function measureRpcs() {
  const results = await Promise.all(RPC_LIST.map(async (url) => {
    const t0 = Date.now();
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      return {url, ms: Date.now() - t0};
    } catch(e) { return {url, ms: 99999}; }
  }));
  results.sort((a, b) => a.ms - b.ms);
  for (const r of results) log(`RTT ${r.url.replace(/https:\/\//,'').slice(0,40)}: ${r.ms}ms`);
  return results.map(r => r.url);
}

// JSON-RPC batch broadcast — semua signed tx dalam 1 POST per RPC, HARD TIMEOUT 800ms
// (pelajaran BrokeCatss: tanpa timeout, fetch nge-hang pas RPC kebanjiran di T-0 →
//  momen kritis ilang 7-8 detik → supply abis. Gagal cepet = retry cepet.)
async function batchBroadcast(url, signedTxs) {
  const body = JSON.stringify(signedTxs.map((s, i) => ({jsonrpc: '2.0', id: i + 1, method: 'eth_sendRawTransaction', params: [s]})));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 800);
  try {
    const res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body, signal: ctrl.signal});
    const data = await res.json();
    const ok = Array.isArray(data) ? data.filter(d => !d.error) : [];
    return ok.map(d => d.result);
  } catch(e) {
    log(`RPC fail ${url.replace(/https:\/\//,'').slice(0,36)}: ${String(e.name||e.message).slice(0,50)}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  log('=== SEADROP RACE v3 START ===');
  log(`NFT=${NFT} qty=${QTY} lead=${LEAD_MS}ms drip=${DRIP_MS}ms nonces=${NONCES} leadWallets=${LEAD_WALLETS}${CALIBRATE ? ' CALIBRATE' : ''}`);

  // 1. Rank RPC by speed (warm connections sekaligus)
  const ranked = await measureRpcs();
  const fast = providers[RPC_LIST.indexOf(ranked[0])];
  log(`RPC tercepat: ${ranked[0]}`);

  // 2. Drop config
  const raw = await fast.call({to: SEADROP, data: sdDropIface.encodeFunctionData('getPublicDrop', [NFT])});
  const drop = sdDropIface.decodeFunctionResult('getPublicDrop', raw)[0];
  const start = Number(drop.startTime);
  const price = drop.mintPrice;
  const VALUE = price * BigInt(QTY);
  const nowSec = Math.floor(Date.now() / 1000);
  log(`start=${new Date(start*1000).toISOString()} (${start-nowSec}s lagi) value/wallet=${ethers.formatEther(VALUE)} cap=${Number(drop.maxLimitPerWallet)}`);

  // 3. Pilih wallet + pre-sign MULTI-NONCE
  let wallets = Object.entries(CONFIG.wallets).filter(([, w]) => w.status === 'active');
  if (WALLET_FILTER.length) wallets = wallets.filter(([id]) => WALLET_FILTER.includes(id));
  const prepared = [];
  for (const [id, w] of wallets) {
    const pk = readPk(w.env);
    const wallet = new ethers.Wallet(pk, fast);
    const baseNonce = await fast.getTransactionCount(w.address, 'pending');
    const calldata = seadropIface.encodeFunctionData('mintPublic', [NFT, FEE_RECIPIENT, w.address, QTY]);
    const txs = [];
    for (let k = 0; k < NONCES; k++) {
      const tx = {
        to: SEADROP, data: calldata, value: VALUE, chainId: CHAIN_ID,
        maxFeePerGas: ethers.parseUnits('0.5', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
        type: 2, nonce: baseNonce + k, gasLimit: GAS_LIMIT,
      };
      txs.push(await wallet.signTransaction(tx));
    }
    prepared.push({id, address: w.address, txs, baseNonce});
    log(`wallet ${id}: pre-sign ${NONCES} nonce (${baseNonce}-${baseNonce+NONCES-1})`);
  }
  log(`SIAP: ${prepared.length} wallet × ${NONCES} nonce`);

  // 4. Kalibrasi (opsional): delay broadcast→included
  let pipelineMs = 250;
  if (CALIBRATE && prepared.length) {
    const testWallet = new ethers.Wallet(readPk(wallets[0][1].env), fast);
    const nonce = await fast.getTransactionCount(testWallet.address, 'pending');
    const testTx = {to: testWallet.address, value: 0n, chainId: CHAIN_ID, maxFeePerGas: ethers.parseUnits('0.5','gwei'), maxPriorityFeePerGas: 0n, type: 2, nonce, gasLimit: 30000n};
    const signed = await testWallet.signTransaction(testTx);
    const t0 = Date.now();
    try { await fast.broadcastTransaction(signed); } catch(e) { log(`kalibrasi broadcast err: ${String(e.message).slice(0,60)}`); }
    let inc = false;
    for (let i = 0; i < 20 && !inc; i++) {
      try {
        const rc = await fast.getTransaction(signed);
        if (rc && rc.blockNumber) inc = true;
      } catch(e) {}
      if (!inc) await sleep(50);
    }
    if (inc) { pipelineMs = Date.now() - t0; log(`kalibrasi: broadcast→included ≈ ${pipelineMs}ms`); }
    else log('kalibrasi: tx test belum ke-include dalam 1s (skip, pakai default)');
  }

  // 5. Pemisahan grup
  const leadGroup = prepared.slice(0, LEAD_WALLETS);
  const t0Group = prepared.slice(LEAD_WALLETS);

  // Sweep fire: kirim nonce k pada T + k*DRIP_MS (T = target berbasis jam lokal)
  async function sweepFire(group, targetMs, label) {
    const out = [];
    const schedules = [];
    for (const {id, txs} of group) {
      for (let k = 0; k < NONCES; k++) {
        schedules.push({id, tx: txs[k], at: targetMs + k * DRIP_MS, label, k});
      }
    }
    // urutkan global by time, tembak berurutan
    schedules.sort((a, b) => a.at - b.at);
    for (const s of schedules) {
      const wait = s.at - Date.now();
      if (wait > 0) await sleep(wait);
      // FIX B: kalau wallet udah mint (allowlist dll), sesuaikan qty = sisa
      let tx = s.tx;
      const pw = prepared.find(p => p.id === s.id);
      if (pw) {
        try {
          const raw = await fast.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [pw.wallet.address])});
          const minted = Number(nftIface.decodeFunctionResult('getMintStats', raw)[0]);
          if (minted > 0 && minted < QTY) {
            const newQty = QTY - minted;
            const newCalldata = seadropIface.encodeFunctionData('mintPublic', [NFT, FEE_RECIPIENT, pw.wallet.address, newQty]);
            const newValue = PRICE > 0n ? PRICE * BigInt(newQty) : 0n;
            const nonce = await fast.getTransactionCount(pw.wallet.address, 'pending');
            tx = await pw.wallet.signTransaction({
              to: SEADROP, data: newCalldata, value: newValue, chainId: CHAIN_ID,
              maxFeePerGas: ethers.parseUnits('0.5', 'gwei'),
              maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
              type: 2, nonce, gasLimit: GAS_LIMIT,
            });
            log(`${s.label} wallet ${s.id}: sudah mint ${minted}, sisa ${newQty} — qty disesuaikan`);
          }
        } catch (e) {}
      }
      // broadcast: PARALEL ke semua RPC, yang pertama sukses menang
      const res = await Promise.allSettled(RPC_LIST.map(url => batchBroadcast(url, [tx])));
      const ok = res.filter(r => r.status === 'fulfilled' && r.value.length);
      const hashes = ok.length ? [ok[0].value[0]] : [];
      out.push({id: s.id, status: hashes.length ? 'sent' : 'fail', tx: hashes[0]});
      if (hashes.length) log(`${s.label} wallet ${s.id} nonce+${s.k}: 🔥 ${hashes[0].slice(0, 18)}`);
      else log(`${s.label} wallet ${s.id} nonce+${s.k}: ❌ broadcast gagal semua RPC`);
    }
    return out;
  }

  // Lead group: sweep mulai start*1000 - LEAD_MS (jam lokal, presisi)
  const leadTarget = start * 1000 - LEAD_MS;
  const t0Target = start * 1000 + 100; // sedikit setelah start — tx yang di-sweep dari lead udah nutupin boundary

  const leadP = (async () => leadGroup.length ? sweepFire(leadGroup, leadTarget, 'LEAD') : [])();
  const t0P = (async () => {
    if (!t0Group.length) return [];
    // grup T-0: tunggu konfirmasi blok, lalu sweep dari sini (backup aman)
    let fired = false;
    while (!fired) {
      try { const b = await fast.getBlock('latest'); if (b.timestamp >= start + 1) fired = true; else await sleep(200); }
      catch(e) { await sleep(200); }
    }
    return sweepFire(t0Group, Date.now(), 'T0');
  })();

  const [leadRes, t0Res] = await Promise.all([leadP, t0P]);
  const results = [...leadRes, ...t0Res];

  // 6. Verifikasi
  await sleep(6000);
  for (const {id, tx} of results) {
    if (!tx) continue;
    let receipt = null;
    for (let i = 0; i < 12 && !receipt; i++) {
      for (const p of providers) {
        try { receipt = await p.getTransactionReceipt(tx); } catch(e) {}
        if (receipt) break;
      }
      if (!receipt) await sleep(1000);
    }
    if (!receipt) { log(`wallet ${id}: tx ${tx.slice(0,18)} belum konfirmasi`); continue; }
    log(`wallet ${id}: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ REVERTED'} gas ${receipt.gasUsed}`);
  }
  for (const {id, address} of prepared) {
    try {
      const raw = await fast.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [address])});
      const s = nftIface.decodeFunctionResult('getMintStats', raw);
      log(`FINAL wallet ${id}: ${s[0]}/${QTY}`);
    } catch(e) {}
  }
  log('=== RACE v3 DONE ===');
})();
