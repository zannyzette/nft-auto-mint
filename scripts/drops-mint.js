#!/usr/bin/env node
/**
 * Drops mint generic — OpenSea Drops API (key dari .env)
 * VERIFIED: Cyclops Eyrix 14/14 wallets (2026-08-15), gas ~121.5k, value 0.0001 ETH.
 * Usage: SLUG=<slug> QTY=<n> node drops-mint.js <wallets>
 *   SLUG = OpenSea collection slug (e.g. cyclopseyrixnft, dirty-degen)
 *   QTY  = quantity per wallet (default 1)
 *   wallets = comma list, default all 15
 * Requires OPENSEA_API_KEY in /home/ubuntu/mint-wallets/.env (chmod 600).
 */
const { ethers } = require('ethers');
const fs = require('fs');

const SLUG = process.env.SLUG || 'cyclopseyrixnft';
const QTY = Number(process.env.QTY || '1');
const CHAIN_ID = 4663;
const RPC = 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]';
const GAS = { gasLimit: 400000, maxFeePerGas: ethers.parseUnits('0.5','gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01','gwei'), type: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const env = fs.readFileSync('/home/ubuntu/mint-wallets/.env', 'utf8');
const API_KEY = (env.match(/^OPENSEA_API_KEY=(\S+)$/m) || [])[1];
if (!API_KEY) { console.error('❌ OPENSEA_API_KEY gak ada di .env'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const p = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });

async function getMintCalldata(addr) {
  const r = await fetch(`https://api.opensea.io/api/v2/drops/${SLUG}/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'accept': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ minter: addr, quantity: QTY })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${d.errors ? JSON.stringify(d.errors).slice(0,150) : JSON.stringify(d).slice(0,150)}`);
  return d;
}

async function main() {
  const ids = (process.argv[2] || '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15').split(',');
  for (const id of ids) {
    const w = cfg.wallets[id];
    if (!w) continue;
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
      console.log(`wallet ${id}: ERR ${(e.shortMessage || e.message || '').slice(0, 130)}`);
    }
    await sleep(1500);
  }
  console.log('\n=== SELESAI ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
