#!/usr/bin/env node
/**
 * SeaDrop FREE-mint RACE v2 — pre-sign + LEAD-FIRE + hedge split + 3-RPC fan-out
 *
 * Strategy (untuk mint yang ada startTime gate, misal SeaDrop mintPublic):
 *   - Semua wallet di-pre-sign duluan (0 RPC saat nembak)
 *   - Group LEAD (--lead-wallets wallet pertama): fire LEAD_MS SEBELUM startTime
 *     → tx udah antri di sequencer pas mint buka (menang posisi). Risiko: kalau
 *     ke-mine sebelum startTime → revert (jadi cuma sebagian wallet yang di-lead).
 *   - Group T-0 (sisanya): fire pas blockTime >= startTime (jalan aman).
 *   - Setiap tx di-broadcast PARALEL ke 3 RPC — yang pertama sampai menang.
 *
 * Usage:
 *   node seadrop-race-v2.js --nft 0x... --qty 10 [--lead 500] [--lead-wallets 5] [--wallets 1-10]
 *
 * Konfigurasi kontrak (Wajib):
 *   --nft <address>          NFT contract (SeaDrop clone/full)
 *   --qty <n>                jumlah per wallet (default 10)
 * Opsional:
 *   --lead <ms>              lead-fire ms sebelum startTime (default 500)
 *   --lead-wallets <n>       berapa wallet pertama yang di-lead (default 5)
 *   --wallets <1-10>         subset wallet (default semua aktif)
 */
const {ethers} = require('ethers');
const fs = require('fs');

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const SEADROP = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';
const FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719';
const CHAIN_ID = 4663;
const LOG = '/home/ubuntu/mint-wallets/seadrop-race-v2.log';

// ── Argumen ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NFT = getArg('--nft', '');
const QTY = parseInt(getArg('--qty', '10'));
const LEAD_MS = parseInt(getArg('--lead', '500'));
const LEAD_WALLETS = parseInt(getArg('--lead-wallets', '5'));
const WALLET_FILTER = getArg('--wallets', '').split(',').filter(Boolean);
if (!NFT || !/^0x[0-9a-fA-F]{40}$/.test(NFT)) { console.error('❌ --nft wajib (alamat NFT contract)'); process.exit(1); }

// ── RPC: canonical + drpc (verified broadcast) + Alchemy ──────────────────
const rpcs = getRpcs();
const RPC_LIST = ['https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp', 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]'].filter((v, i, a) => v && a.indexOf(v) === i);
const providers = RPC_LIST.map(u => new ethers.JsonRpcProvider(u));
const primary = providers[0];
const GAS_LIMIT = 500000n;

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

async function fanoutFire(signed) {
  const res = await Promise.allSettled(providers.map(async p => {
    const s = await p.broadcastTransaction(signed);
    return s.hash;
  }));
  const ok = res.filter(r => r.status === 'fulfilled');
  return ok.length ? {ok: true, hash: ok[0].value} : {ok: false, err: res[0]?.reason?.message || 'all fail'};
}

async function fireWallet(wallet, calldata, value, tag) {
  // anti-duplikasi: cek belum mint
  try {
    const raw = await primary.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [wallet.address])});
    const s = nftIface.decodeFunctionResult('getMintStats', raw);
    if (Number(s[0]) >= QTY) { log(`${tag}: sudah mint ${s[0]}/${QTY} — SKIP`); return {tag, status: 'already'}; }
  } catch(e) {}
  const nonce = await primary.getTransactionCount(wallet.address, 'pending');
  const tx = {
    to: SEADROP, data: calldata, value, chainId: CHAIN_ID,
    maxFeePerGas: ethers.parseUnits('0.5', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
    type: 2, nonce, gasLimit: GAS_LIMIT,
  };
  const signed = await wallet.signTransaction(tx);
  const res = await fanoutFire(signed);
  if (!res.ok) { log(`${tag}: broadcast FAIL ${String(res.err).slice(0,70)}`); return {tag, status: 'fail'}; }
  log(`${tag}: 🔥 fired (nonce ${nonce}) ${res.hash.slice(0,18)}`);
  return {tag, status: 'sent', tx: res.hash};
}

(async () => {
  log('=== SEADROP RACE v2 START ===');
  log(`NFT=${NFT} qty=${QTY} lead=${LEAD_MS}ms leadWallets=${LEAD_WALLETS} RPCs=${RPC_LIST.length}`);

  // 1. Drop config
  const raw = await primary.call({to: SEADROP, data: sdDropIface.encodeFunctionData('getPublicDrop', [NFT])});
  const drop = sdDropIface.decodeFunctionResult('getPublicDrop', raw)[0];
  const start = Number(drop.startTime);
  const price = drop.mintPrice;
  const VALUE = price * BigInt(QTY); // paid mint: value = price × qty (free mint: 0)
  const now = Math.floor(Date.now() / 1000);
  log(`start=${new Date(start*1000).toISOString()} (${start-now}s lagi) price=${ethers.formatEther(price)} value/wallet=${ethers.formatEther(VALUE)} cap=${Number(drop.maxLimitPerWallet)}`);

  // 2. Pilih wallet
  let wallets = Object.entries(CONFIG.wallets).filter(([, w]) => w.status === 'active');
  if (WALLET_FILTER.length) wallets = wallets.filter(([id]) => WALLET_FILTER.includes(id));
  const prepared = [];
  for (const [id, w] of wallets) {
    const pk = readPk(w.env);
    prepared.push({id, wallet: new ethers.Wallet(pk, primary), calldata: seadropIface.encodeFunctionData('mintPublic', [NFT, FEE_RECIPIENT, w.address, QTY])});
  }
  log(`wallet siap: ${prepared.length} (${prepared.map(p => p.id).join(',')})`);

  // 3. Lead group fire
  const leadGroup = prepared.slice(0, LEAD_WALLETS);
  const t0Group = prepared.slice(LEAD_WALLETS);
  if (leadGroup.length) log(`lead group (${LEAD_MS}ms sebelum start): wallet ${leadGroup.map(p=>p.id).join(',')}`);
  if (t0Group.length) log(`t-0 group (pas start): wallet ${t0Group.map(p=>p.id).join(',')}`);

  const results = [];

  // Lead fire — setTimeout ke startTime - LEAD_MS
  const leadPromise = (async () => {
    if (!leadGroup.length) return [];
    const target = start * 1000 - LEAD_MS;
    const wait = Math.max(0, target - Date.now());
    log(`lead fire dalam ${(wait/1000).toFixed(2)}s...`);
    await sleep(wait);
    const out = [];
    for (const {id, wallet, calldata} of leadGroup) {
      out.push(await fireWallet(wallet, calldata, VALUE, `wallet ${id} (LEAD)`));
    }
    return out;
  })();

  // T-0 fire — poll block timestamp >= start
  const t0Promise = (async () => {
    if (!t0Group.length) return [];
    log('t-0 group menunggu blockTime >= start...');
    let fired = false;
    while (!fired) {
      try {
        const b = await primary.getBlock('latest');
        if (b.timestamp >= start) fired = true;
        else await sleep(1000);
      } catch(e) { await sleep(1000); }
    }
    const out = [];
    for (const {id, wallet, calldata} of t0Group) {
      out.push(await fireWallet(wallet, calldata, VALUE, `wallet ${id} (T0)`));
    }
    return out;
  })();

  const [leadRes, t0Res] = await Promise.all([leadPromise, t0Promise]);
  results.push(...leadRes, ...t0Res);

  // 4. Tunggu receipt + verifikasi
  await sleep(8000);
  for (const r of results) {
    if (!r.tx) continue;
    let receipt = null;
    for (let i = 0; i < 12 && !receipt; i++) {
      for (const p of providers) {
        try { receipt = await p.getTransactionReceipt(r.tx); } catch(e) {}
        if (receipt) break;
      }
      if (!receipt) await sleep(2000);
    }
    if (!receipt) { log(`${r.tag}: tx ${r.tx.slice(0,18)} belum konfirmasi — cek manual`); continue; }
    log(`${r.tag}: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ REVERTED'} gas ${receipt.gasUsed}`);
  }
  for (const {id, wallet} of prepared) {
    try {
      const raw = await primary.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [wallet.address])});
      const s = nftIface.decodeFunctionResult('getMintStats', raw);
      log(`FINAL wallet ${id}: ${s[0]}/${QTY}`);
    } catch(e) {}
  }
  log('=== RACE v2 DONE ===');
})();
