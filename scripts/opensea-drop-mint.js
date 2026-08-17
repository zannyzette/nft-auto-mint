#!/usr/bin/env node
/**
 * opensea-drop-mint.js — PROVEN drops-API mint (worked: Cyclops Eyrix 14/14, GreedCats)
 * Reads OPENSEA_API_KEY from /home/ubuntu/mint-wallets/.env, POSTs /drops/{slug}/mint
 * per wallet, signs + broadcasts the returned calldata as-is (wrapper + embedded
 * OpenSea signature — do NOT decode/rebuild).
 *
 * Usage: node opensea-drop-mint.js <slug> <qty> [wallets "1,2,3"] 
 *   (wallets default: all active in wallets.json; qty default 1)
 * Requires ethers + wallets.json + per-wallet .env PKs.
 */
const { ethers } = require('ethers');
const fs = require('fs');

const SLUG = process.argv[2];
const QTY = parseInt(process.argv[3] || '1', 10);
const IDS = (process.argv[4] || '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15').split(',');
if (!SLUG) { console.error('Usage: node opensea-drop-mint.js <slug> <qty> [wallets]'); process.exit(1); }

const CHAIN_ID = 4663;
const RPC = 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]';
const GAS = { gasLimit: 400000, maxFeePerGas: ethers.parseUnits('0.5','gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01','gwei'), type: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const env = fs.readFileSync('/home/ubuntu/mint-wallets/.env', 'utf8');
const API_KEY = (env.match(/^OPENSEA_API_KEY=(\S+)$/m) || [])[1];
if (!API_KEY) { console.error('❌ OPENSEA_API_KEY tidak ada di .env'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const p = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });

async function getMintCalldata(addr) {
  const r = await fetch(`https://api.opensea.io/api/v2/drops/${SLUG}/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'accept': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ minter: addr, quantity: QTY })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${d.errors ? JSON.stringify(d.errors).slice(0,140) : JSON.stringify(d).slice(0,140)}`);
  return d; // {to, data, value, chain}
}

async function main() {
  console.log(`🎯 drops-API mint: ${SLUG} ×${QTY} | ${IDS.length} wallet`);
  for (const id of IDS) {
    const w = cfg.wallets[id];
    if (!w) { console.log(`wallet ${id}: gak ada di wallets.json`); continue; }
    const pk = fs.readFileSync(w.env, 'utf8').match(/^PRIVATE_KEY=(\S+)$/m)[1];
    const wallet = new ethers.Wallet(pk);
    try {
      const mint = await getMintCalldata(wallet.address);
      const value = BigInt(mint.value || '0');
      const nonce = await p.getTransactionCount(wallet.address, 'pending');
      const signed = await wallet.signTransaction({ to: mint.to, data: mint.data, value, chainId: CHAIN_ID, ...GAS, nonce });
      const h = await p.broadcastTransaction(signed);
      console.log(`wallet ${id}: 🔥 ${h.hash.slice(0,22)} | value ${ethers.formatEther(value)} ETH | qty ${QTY}`);
      let rc = null;
      for (let i = 0; i < 12 && !rc; i++) { await sleep(2000); try { rc = await p.getTransactionReceipt(h.hash); } catch (e) {} }
      if (rc) console.log(`  ${rc.status === 1 ? '✅ SUKSES' : '❌ REVERT'} (gas ${rc.gasUsed.toString()})`);
      else console.log(`  ⏳ pending...`);
    } catch (e) {
      const msg = (e.shortMessage || e.message || '').slice(0, 140);
      if (/422/.test(msg)) console.log(`wallet ${id}: ⏭️ tidak eligible (422)`);
      else if (/409/.test(msg)) console.log(`wallet ${id}: ⏳ stage belum aktif (409)`);
      else console.log(`wallet ${id}: ERR ${msg}`);
    }
    await sleep(1500);
  }
  console.log('\n=== SELESAI ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
