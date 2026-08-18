#!/usr/bin/env node
// Generic SeaDrop multi-wallet mint (Robinhood chain) — battle-tested on:
//   Hood Skunks (FREE, 10 wallets × 3)  ·  Sushicat (PAID 0.00014 ETH, 5 wallets × 10)  ·  CatHood (FREE, price-flip mid-window)
//
// EDIT KONSTANTA DI BAWAH SEBELUM JALAN:
//   NFT / SEADROP / MAX_PER_WALLET / PRICE (0n utk free) / FEE_RECIPIENT / TARGET_WALLETS
//
// WAJIB (pelajaran live):
//   - chainId: 4663 EKSPLISIT — ethers v6 Wallet(pk, provider) signs chainId=0 → "invalid chain id for signer: have 0 want 4663"
//   - feeRecipient BUKAN zero — SeaDrop revert FeeRecipientCannotBeZeroAddress (0x5136e8d5); pakai OpenSea fee collector dari collection fees[],
//     atau decode arg tx mintPublic orang yang sukses (Blockscout) dan tiru persis
//   - staticCall sim SEBELUM broadcast; kalau revert custom-error, decode selector dulu (bukan asumsi RPC flaky) — bisa jadi harga diubah owner
//   - BACA ULANG getPublicDrop + sim sesaat sebelum batch (drop config bisa berubah mid-window)
//
// KECEPATAN (operator requirement): jalankan 5-10 wallet PARALEL (Promise.all) — wallet independen; batch getMintStats;
// jangan retry sim 3x dengan sleep 1.5s per wallet (≈27s/wallet) — retry cepat 2x atau skip.
//
// PK dibaca dari /home/ubuntu/mint-wallets/wallet-<id>/.env (wallets.json), TIDAK PERNAH di-print.
const {ethers} = require('ethers');
const fs = require('fs');

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));

// ===== KONFIGURASI (EDIT DI SINI) =====
const NFT = '0x...';                                  // kontrak NFT (ERC721SeaDrop)
const SEADROP = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5'; // SeaDrop standar Robinhood
const MAX_PER_WALLET = 3;                             // dari getPublicDrop maxLimitPerWallet
const PRICE = ethers.parseUnits('0', 'ether');        // 0 = free; selain itu price per NFT
const FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719'; // OpenSea fee collector (tolak zero)
const TARGET_WALLETS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const GAS_RESERVE = ethers.parseUnits('0.0006', 'ether');
const LOG = '/home/ubuntu/mint-wallets/seadrop-mint.log';
// ======================================

const rpcs = getRpcs();
const providers = rpcs.both.map(u => new ethers.JsonRpcProvider(u));
const primary = providers[0];

const seadropIface = new ethers.Interface([
  'function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable',
]);
const nftIface = new ethers.Interface([
  'function getMintStats(address minter) view returns (uint256 minted, uint256 totalMinted, uint256 maxSupply)',
  'function totalSupply() view returns (uint256)',
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

async function rpcCall(fn, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    for (const p of providers) {
      try { return await fn(p); }
      catch(e) { lastErr = e; }
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 800));
  }
  throw lastErr;
}

async function mintOne(id) {
  const w = CONFIG.wallets[id];
  if (!w || w.status !== 'active') return {id, qty: 0, status: 'skip-inactive'};
  try {
    const pk = readPk(w.env);
    const wallet = new ethers.Wallet(pk, primary);

    // 1. Sudah mint berapa + balance (parallel-able)
    const statsRaw = await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [w.address])}));
    const stats = nftIface.decodeFunctionResult('getMintStats', statsRaw);
    const minted = Number(stats[0]);
    const bal = await rpcCall(p => p.getBalance(w.address));
    const affordable = Math.floor((Number(bal) - Number(GAS_RESERVE)) / Number(PRICE || 1n));
    const remaining = MAX_PER_WALLET - minted;
    const qty = Math.max(0, Math.min(remaining, PRICE === 0n ? remaining : affordable));
    if (qty <= 0) return {id, qty: 0, status: 'skip'};

    // 2. Simulasi (2x cepat — kalau revert dua-duanya, decode selector & cek drop config lagi)
    const value = PRICE * BigInt(qty);
    const calldata = seadropIface.encodeFunctionData('mintPublic', [NFT, FEE_RECIPIENT, w.address, qty]);
    let simOk = false;
    for (let i = 0; i < 2 && !simOk; i++) {
      try {
        await rpcCall(p => p.call({to: SEADROP, data: calldata, from: w.address, value}));
        simOk = true;
      } catch(e) {
        if (i === 1) {
          log(`wallet ${id}: SIM REVERT 2x (${e.data || String(e.shortMessage||e.message).slice(0,60)}) — cek getPublicDrop/price, mungkin berubah`);
          return {id, qty, status: 'sim-revert'};
        }
      }
    }
    if (!simOk) return {id, qty, status: 'sim-revert'};

    // 3. Sign + broadcast
    const nonce = await rpcCall(p => p.getTransactionCount(w.address, 'pending'));
    const txReq = {
      to: SEADROP, data: calldata, value,
      chainId: 4663, // WAJIB eksplisit (ethers v6 bug)
      maxFeePerGas: ethers.parseUnits('0.15', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      type: 2, nonce,
    };
    let gasLimit = 500000n;
    try {
      const est = await rpcCall(p => p.estimateGas({...txReq, from: w.address}));
      gasLimit = (est * 130n) / 100n;
    } catch(e) { log(`wallet ${id}: estimateGas fail — pakai 500k`); }
    txReq.gasLimit = gasLimit;

    const signed = await wallet.signTransaction(txReq);
    let sent = null;
    for (const p of providers) {
      try { sent = await p.broadcastTransaction(signed); break; }
      catch(e) { log(`wallet ${id}: broadcast RPC gagal, coba lain`); }
    }
    if (!sent) return {id, qty, status: 'broadcast-fail'};
    log(`wallet ${id}: MINT ${qty} NFT (${ethers.formatEther(value)} ETH) — tx ${sent.hash}`);

    let receipt = null;
    for (let i = 0; i < 15 && !receipt; i++) {
      for (const p of providers) {
        try { receipt = await p.getTransactionReceipt(sent.hash); } catch(e) {}
        if (receipt) break;
      }
      if (!receipt) await new Promise(r => setTimeout(r, 2000));
    }
    if (!receipt) return {id, qty, status: 'pending-check', tx: sent.hash};
    const ok = receipt.status === 1;
    log(`wallet ${id}: ${ok ? 'SUCCESS' : 'REVERTED'} — block ${receipt.blockNumber} gasUsed ${receipt.gasUsed}`);
    return {id, qty, status: ok ? 'success' : 'reverted', tx: sent.hash};
  } catch(e) {
    log(`wallet ${id}: ERROR ${String(e.shortMessage || e.message).slice(0, 100)}`);
    return {id, qty: 0, status: 'error'};
  }
}

(async () => {
  log('=== SEADROP MINT START ===');
  try {
    const ts = await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('totalSupply')}));
    log('totalSupply: ' + Number(nftIface.decodeFunctionResult('totalSupply', ts)[0]));
  } catch(e) { /* skip */ }

  // PARALEL — semua wallet sekaligus (operator requirement: cepat)
  const results = await Promise.all(TARGET_WALLETS.map(mintOne));

  log('=== DONE ===');
  for (const r of results) console.log(`wallet ${r.id}: qty=${r.qty} status=${r.status}${r.tx ? ' tx=' + r.tx : ''}`);
  console.log('TOTAL: ' + results.filter(r => r.status === 'success').length + ' wallet, ' +
    results.reduce((a, r) => a + r.qty, 0) + ' NFT');
})();
