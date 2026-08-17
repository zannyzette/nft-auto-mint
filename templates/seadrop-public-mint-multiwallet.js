#!/usr/bin/env node
// SeaDrop PUBLIC-stage multi-wallet mint (mintPublic) — Robinhood chain.
// VERIFIED LIVE 2026-08-12: Hood Skunks (free, 10 wallets x 3) + Sushicat (paid, 5 wallets x 10).
// Robust against hot-drop RPC flakiness: retry 3x alternating dual-RPC, staticCall sim
// before broadcast, per-wallet getMintStats remaining check, affordability math for paid mints.
// PK dibaca dari .env per wallet — TIDAK PERNAH di-print.
//
// Usage: edit constants below, then:
//   NODE_PATH=/tmp/neon-sign/node_modules node seadrop-public-mint-multiwallet.js
const {ethers} = require('ethers');
const fs = require('fs');

// ── EDIT ME ──────────────────────────────────────────────────────────────
const NFT = '0x[YOUR_WALLET_ADDRESS]';          // NFT contract (ERC721SeaDrop)
const SEADROP = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';      // OpenSea SeaDrop (Robinhood)
const MAX_PER_WALLET = 10;                                          // getPublicDrop().maxLimitPerWallet
const PRICE_ETH = '0.00014';                                        // getPublicDrop().mintPrice — '0' for free mint
const TARGET_WALLETS = ['1', '2', '3', '4', '5'];                   // ids in wallets.json
// OpenSea fee collector (collection config fees[] required=true). SeaDrop REJECTS zero here
// (FeeRecipientCannotBeZeroAddress). Ground truth: decode a successful mintPublic tx.
const FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719';
const LOG = '/home/ubuntu/mint-wallets/seadrop-mint.log';
// ─────────────────────────────────────────────────────────────────────────

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const PRICE = ethers.parseUnits(PRICE_ETH, 'ether');
const GAS_RESERVE = ethers.parseUnits('0.0006', 'ether'); // sisa gas tiap wallet

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

// Retry: alternate providers, 3 passes, backoff — RPCs return transient garbage during hot drops
async function rpcCall(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    for (const p of providers) {
      try { return await fn(p); }
      catch(e) { lastErr = e; }
    }
    await new Promise(r => setTimeout(r, 1200 * (i + 1)));
  }
  throw lastErr;
}

(async () => {
  log('=== SEADROP MINT START ===');
  try {
    const ts = await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('totalSupply')}));
    log('totalSupply: ' + nftIface.decodeFunctionResult('totalSupply', ts)[0] + '/?');
  } catch(e) { log('totalSupply read fail: ' + e.message); }

  const results = [];
  for (const id of TARGET_WALLETS) {
    const w = CONFIG.wallets[id];
    if (!w || w.status !== 'active') { log(`wallet ${id}: SKIP (status ${w?.status})`); continue; }
    try {
      const pk = readPk(w.env);
      const wallet = new ethers.Wallet(pk, primary);

      // 1. Sudah mint berapa + affordability
      const statsRaw = await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [w.address])}));
      const stats = nftIface.decodeFunctionResult('getMintStats', statsRaw); // pakai iface, bukan ethers.*
      const minted = Number(stats[0]);
      const bal = await rpcCall(p => p.getBalance(w.address));
      const remaining = MAX_PER_WALLET - minted;
      const qty = PRICE > 0n
        ? Math.min(remaining, Math.floor((Number(bal) - Number(GAS_RESERVE)) / Number(PRICE)))
        : remaining; // free mint
      if (qty <= 0) {
        log(`wallet ${id}: minted=${minted}/${MAX_PER_WALLET} balance=${ethers.formatEther(bal)} → qty 0, SKIP`);
        results.push({id, qty: 0, status: 'skip'});
        continue;
      }

      // 2. staticCall SIM dulu — retry, RPC kadang garbage pas drop rame
      const value = PRICE * BigInt(qty);
      const calldata = seadropIface.encodeFunctionData('mintPublic', [NFT, FEE_RECIPIENT, w.address, qty]);
      let simOk = false;
      for (let i = 0; i < 3 && !simOk; i++) {
        try {
          await rpcCall(p => p.call({to: SEADROP, data: calldata, from: w.address, value}));
          simOk = true;
        } catch(e) {
          if (i === 2) {
            log(`wallet ${id}: SIMULASI REVERT 3x (${String(e.shortMessage||e.message).slice(0,70)}) — SKIP`);
            results.push({id, qty, status: 'sim-revert'});
          } else { await new Promise(r => setTimeout(r, 1500)); }
        }
      }
      if (!simOk) continue;

      // 3. Sign — chainId WAJIB eksplisit (ethers v6 sign 0 kalau tidak)
      const nonce = await rpcCall(p => p.getTransactionCount(w.address, 'pending'));
      const txReq = {
        to: SEADROP, data: calldata, value,
        chainId: 4663, // Robinhood
        maxFeePerGas: ethers.parseUnits('0.15', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
        type: 2, nonce,
      };
      let gasLimit = 500000n;
      try {
        const est = await rpcCall(p => p.estimateGas({...txReq, from: w.address}));
        gasLimit = (est * 130n) / 100n;
      } catch(e) { log(`wallet ${id}: estimateGas fail — pakai 500k (${String(e.shortMessage||e.message).slice(0,50)})`); }
      txReq.gasLimit = gasLimit;

      const signed = await wallet.signTransaction(txReq);
      let sent = null;
      for (const p of providers) {
        try { sent = await p.broadcastTransaction(signed); break; }
        catch(e) { log(`wallet ${id}: broadcast RPC gagal, coba lain (${String(e.shortMessage||e.message).slice(0,60)})`); }
      }
      if (!sent) throw new Error('broadcast gagal di semua RPC');
      log(`wallet ${id}: MINT ${qty} NFT (${ethers.formatEther(value)} ETH) — tx ${sent.hash} (gas ${gasLimit})`);

      let receipt = null;
      for (let i = 0; i < 15 && !receipt; i++) {
        for (const p of providers) {
          try { receipt = await p.getTransactionReceipt(sent.hash); } catch(e) {}
          if (receipt) break;
        }
        if (!receipt) await new Promise(r => setTimeout(r, 2000));
      }
      if (!receipt) {
        log(`wallet ${id}: tx terkirim, receipt belum konfirmasi (${sent.hash}) — cek manual`);
        results.push({id, qty, status: 'pending-check', tx: sent.hash});
        continue;
      }
      const ok = receipt.status === 1;
      log(`wallet ${id}: ${ok ? '✅ SUCCESS' : '❌ REVERTED'} — block ${receipt.blockNumber} gasUsed ${receipt.gasUsed}`);
      results.push({id, qty, status: ok ? 'success' : 'reverted', tx: sent.hash});
    } catch(e) {
      log(`wallet ${id}: ERROR ${String(e.shortMessage || e.message).slice(0, 120)}`);
      results.push({id, qty: 0, status: 'error: ' + String(e.message).slice(0, 80)});
    }
  }

  log('=== SEADROP MINT DONE ===');
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`wallet ${r.id}: qty=${r.qty} status=${r.status}${r.tx ? ' tx=' + r.tx : ''}`);
  }
  const okW = results.filter(r => r.status === 'success').length;
  const total = results.reduce((a, r) => a + r.qty, 0);
  console.log(`\nTOTAL SUCCESS: ${okW} wallet, ${total} NFT (${ethers.formatEther(PRICE * BigInt(total))} ETH + gas)`);
})();
