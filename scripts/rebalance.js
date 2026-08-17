#!/usr/bin/env node
/**
 * Auto-rebalance — top up wallet target dari wallet lain yang punya surplus.
 *
 * Usage:
 *   node rebalance.js --wallet 1 --target-usd 20 [--reserve-usd 5] [--dry-run]
 *   node rebalance.js --wallet 1 --target-eth 0.0105
 *
 * Logika:
 *   1. Baca balance semua wallet
 *   2. Shortfall target = target - balance target
 *   3. Sumber = wallet lain yang balance-nya di atas reserve (default $5)
 *      → urut dari surplus terbesar
 *   4. Kirim dari sumber sampai shortfall kebayar (atau sumber abis)
 *   5. --dry-run = cuma nunjukin rencana, gak kirim
 */
const {ethers} = require('ethers');
const fs = require('fs');

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : d; };
const TARGET = getArg('--wallet', '');
const TARGET_USD = parseFloat(getArg('--target-usd', '0'));
const TARGET_ETH = parseFloat(getArg('--target-eth', '0'));
const RESERVE_USD = parseFloat(getArg('--reserve-usd', '5'));
const DRY = args.includes('--dry-run');
const ETH_USD = 1911.8;
if (!TARGET) { console.error('--wallet wajib'); process.exit(1); }
if (!TARGET_USD && !TARGET_ETH) { console.error('--target-usd ATAU --target-eth wajib'); process.exit(1); }

const rpcs = getRpcs();
const provider = new ethers.JsonRpcProvider(rpcs.primary);

(async () => {
  // baca semua balance
  const balances = {};
  for (const [id, w] of Object.entries(CONFIG.wallets)) {
    if (w.status !== 'active') continue;
    const bal = await provider.getBalance(w.address);
    balances[id] = Number(bal) / 1e18;
  }
  console.log('=== BALANCE ===');
  for (const [id, b] of Object.entries(balances)) {
    console.log(`  wallet ${id}: ${b.toFixed(5)} ETH (~$${(b*ETH_USD).toFixed(2)})`);
  }

  const targetBal = balances[TARGET] || 0;
  const targetEth = TARGET_ETH > 0 ? TARGET_ETH : TARGET_USD / ETH_USD;
  let shortfall = targetEth - targetBal;
  console.log(`\nTarget: wallet ${TARGET} → ${targetEth.toFixed(6)} ETH (~$${(targetEth*ETH_USD).toFixed(2)})`);
  console.log(`Balance target: ${targetBal.toFixed(6)} ETH — shortfall: ${shortfall.toFixed(6)} ETH (~$${(shortfall*ETH_USD).toFixed(2)})`);
  if (shortfall <= 0.0001) { console.log('✅ Target sudah cukup — gak perlu kirim'); return; }

  // sumber: wallet lain dengan surplus di atas reserve
  const reserveEth = RESERVE_USD / ETH_USD;
  const sources = [];
  for (const [id, b] of Object.entries(balances)) {
    if (id === TARGET) continue;
    const surplus = b - reserveEth;
    if (surplus > 0.0002) sources.push({id, surplus, bal: b});
  }
  sources.sort((a, b) => b.surplus - a.surplus);
  console.log(`\nSumber (di atas reserve $${RESERVE_USD}):`);
  for (const s of sources) console.log(`  wallet ${s.id}: surplus ${s.surplus.toFixed(6)} ETH (~$${(s.surplus*ETH_USD).toFixed(2)})`);
  if (!sources.length) { console.log('❌ Gak ada sumber — semua wallet di bawah reserve'); return; }

  // rencana kirim
  const plan = [];
  let remaining = shortfall;
  for (const s of sources) {
    if (remaining <= 0.00005) break;
    const send = Math.min(s.surplus, remaining);
    plan.push({from: s.id, to: TARGET, amount: send});
    remaining -= send;
  }
  console.log('\n=== RENCANA KIRIM ===');
  let sentTotal = 0;
  for (const p of plan) {
    console.log(`  wallet ${p.from} → wallet ${TARGET}: ${p.amount.toFixed(6)} ETH (~$${(p.amount*ETH_USD).toFixed(2)})`);
    sentTotal += p.amount;
  }
  console.log(`Total kirim: ${sentTotal.toFixed(6)} ETH (~$${(sentTotal*ETH_USD).toFixed(2)})`);
  if (remaining > 0.00005) console.log(`⚠️ Sisa shortfall belum kebayar: ${remaining.toFixed(6)} ETH (sumber gak cukup)`);

  if (DRY) { console.log('\n[dry-run — gak ada yang dikirim]'); return; }

  // eksekusi: tiap sumber kirim dengan PK masing-masing
  for (const p of plan) {
    const env = fs.readFileSync(CONFIG.wallets[p.from].env, 'utf8');
    const pk = env.match(/^PRIVATE_KEY=(\S+)$/m)[1];
    const wallet = new ethers.Wallet(pk, provider);
    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    const tx = {to: CONFIG.wallets[TARGET].address, value: ethers.parseEther(p.amount.toFixed(6)), chainId: 4663,
      maxFeePerGas: ethers.parseUnits('0.5', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      type: 2, nonce, gasLimit: 50000n};
    const sent = await provider.broadcastTransaction(await wallet.signTransaction(tx));
    console.log(`✅ wallet ${p.from} → ${TARGET}: ${p.amount.toFixed(6)} ETH (${sent.hash.slice(0,18)}...)`);
  }
  console.log('\n=== SELESAI ===');
})();
