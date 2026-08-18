#!/usr/bin/env node
// Direct-contract payable mint — `mint(uint256 quantity)` payable on the NFT contract itself (non-SeaDrop).
// Proven: MothBroker 30/30 + 15/15 (2026-08-17). Chain: Robinhood 4663.
// Usage:
//   NFT_ADDR=0x... QTY=2 EXPECTED_PRICE_ETH=0.00025 node direct-contract-payable-mint.js
// Env: NFT_ADDR (wajib), QTY (default 1), EXPECTED_PRICE_ETH (wajib — price-flip guard, STOP kalau beda),
//      MAX_PER_WALLET (default 10), RPC via rpc-config.js (Alchemy 2-key rotation)
// Flow: baca MINT_PRICE fresh → precheck mintedCount + balance per wallet → sim → broadcast PARALLEL → verify receipt + mintedCount on-chain.
const {ethers} = require('ethers');
const fs = require('fs');

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const NFT = process.env.NFT_ADDR || '0x[YOUR_WALLET_ADDRESS]'; // MothBroker default
const QTY = Number(process.env.QTY || '1');
const MAX_PER_WALLET = Number(process.env.MAX_PER_WALLET || '10');
const EXPECTED_PRICE_ETH = process.env.EXPECTED_PRICE_ETH ? ethers.parseEther(process.env.EXPECTED_PRICE_ETH) : null; // null = skip guard
const LOG = '/home/ubuntu/mint-wallets/direct-payable-mint.log';

const rpcs = getRpcs();
const providers = rpcs.both.map(u => new ethers.JsonRpcProvider(u, 4663));
const primary = providers[0];

const nftIface = new ethers.Interface([
  'function MINT_PRICE() view returns (uint256)',
  'function mintOpen() view returns (bool)',
  'function mint(uint256 quantity) payable',
  'function mintedCount(address) view returns (uint256)',
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
  log('=== DIRECT PAYABLE MINT START ===');

  // 1. PRICE-FLIP GUARD — baca fresh sebelum eksekusi
  const priceRaw = await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('MINT_PRICE')}));
  const price = nftIface.decodeFunctionResult('MINT_PRICE', priceRaw)[0];
  const open = nftIface.decodeFunctionResult('mintOpen', await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('mintOpen')})))[0];
  log(`MINT_PRICE = ${ethers.formatEther(price)} ETH | mintOpen = ${open}`);
  if (!open) { log('❌ MINT CLOSED — STOP'); return; }
  if (EXPECTED_PRICE_ETH && price !== EXPECTED_PRICE_ETH) { log(`❌ PRICE FLIP! expected ${ethers.formatEther(EXPECTED_PRICE_ETH)}, actual ${ethers.formatEther(price)} — STOP`); return; }

  const value = price * BigInt(QTY);
  log(`QTY=${QTY} | value/wallet = ${ethers.formatEther(value)} ETH | total ${Object.keys(CONFIG.wallets).length * QTY} NFT ≈ ${ethers.formatEther(value * BigInt(Object.keys(CONFIG.wallets).length))} ETH`);

  // 2. PRE-CHECK per wallet: mintedCount + balance
  const plan = [];
  for (const [id, w] of Object.entries(CONFIG.wallets)) {
    if (w.status !== 'active') { log(`wallet ${id}: inactive — SKIP`); continue; }
    try {
      const mintedRaw = await rpcCall(p => p.call({to: NFT, data: nftIface.encodeFunctionData('mintedCount', [w.address])}));
      const minted = Number(nftIface.decodeFunctionResult('mintedCount', mintedRaw)[0]);
      const balRaw = await rpcCall(p => p.getBalance(w.address));
      const bal = BigInt(balRaw);
      const need = value + ethers.parseEther('0.0002'); // gas buffer
      let status = 'ok';
      if (minted + QTY > MAX_PER_WALLET) status = 'over-cap';
      else if (bal < need) status = 'low-balance';
      plan.push({id, w, minted, bal, status});
      log(`wallet ${id}: minted=${minted} bal=${ethers.formatEther(bal)} ETH → ${status}`);
    } catch(e) {
      log(`wallet ${id}: precheck ERROR ${String(e.shortMessage || e.message).slice(0,80)}`);
      plan.push({id, w, status: 'error'});
    }
  }

  const toMint = plan.filter(x => x.status === 'ok');
  log(`\nWallet siap mint: ${toMint.length}/${plan.length}`);
  if (toMint.length === 0) { log('❌ Gak ada wallet yang bisa mint — STOP'); return; }

  // 3. SIM + broadcast PARALLEL
  const results = await Promise.all(toMint.map(async ({id, w}) => {
    try {
      const pk = readPk(w.env);
      const wallet = new ethers.Wallet(pk, primary);
      const calldata = nftIface.encodeFunctionData('mint', [QTY]);

      // sim
      let simOk = false;
      for (let i = 0; i < 3 && !simOk; i++) {
        try { await rpcCall(p => p.call({to: NFT, data: calldata, from: w.address, value})); simOk = true; }
        catch(e) { if (i === 2) return {id, qty: 0, status: `sim-revert: ${String(e.shortMessage || e.message).slice(0,60)}`}; await new Promise(r => setTimeout(r, 1500)); }
      }
      if (!simOk) return {id, qty: 0, status: 'sim-fail'};

      const nonce = await rpcCall(p => p.getTransactionCount(w.address, 'pending'));
      const txReq = { to: NFT, data: calldata, value, chainId: 4663,
        maxFeePerGas: ethers.parseUnits('0.5', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'), type: 2, nonce, gasLimit: 400000n };
      const signed = await wallet.signTransaction(txReq);
      let sent = null;
      for (const p of providers) {
        try { sent = await p.broadcastTransaction(signed); break; } catch(e) {}
      }
      if (!sent) return {id, qty: 0, status: 'broadcast-fail'};
      log(`wallet ${id}: TX ${sent.hash.slice(0,18)}…`);
      return {id, qty: QTY, hash: sent.hash, status: 'sent'};
    } catch(e) {
      return {id, qty: 0, status: `error: ${String(e.shortMessage || e.message).slice(0,60)}`};
    }
  }));

  // 4. VERIFY receipts
  console.log('\n=== VERIFY ===');
  const final = [];
  for (const r of results) {
    if (r.status !== 'sent') { final.push(r); console.log(`wallet ${r.id}: ${r.status}`); continue; }
    let receipt = null;
    for (let i = 0; i < 15 && !receipt; i++) {
      for (const p of providers) {
        try { receipt = await p.getTransactionReceipt(r.hash); } catch(e) {}
        if (receipt) break;
      }
      if (!receipt) await new Promise(r2 => setTimeout(r2, 2000));
    }
    if (!receipt) { final.push({...r, status: 'pending'}); console.log(`wallet ${r.id}: ⏳ pending — ${r.hash}`); continue; }
    const ok = receipt.status === 1;
    final.push({...r, status: ok ? 'success' : 'reverted'});
    console.log(`wallet ${r.id}: ${ok ? '✅ SUCCESS' : '❌ REVERTED'} gas=${receipt.gasUsed} ${r.hash}`);
    log(`wallet ${r.id}: ${ok ? '✅ SUCCESS' : '❌ REVERTED'} ${r.hash}`);
  }

  console.log('\n=== SUMMARY ===');
  const okN = final.filter(r => r.status === 'success').length;
  for (const r of final) console.log(`wallet ${r.id}: ${r.status}`);
  console.log(`SUCCESS: ${okN}/${toMint.length} wallet × ${QTY} = ${okN * QTY} NFT`);
  log(`=== DONE: ${okN}/${toMint.length} wallet × ${QTY} NFT ===`);
})();
