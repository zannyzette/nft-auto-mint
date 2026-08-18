#!/usr/bin/env node
/**
 * WETH UNWRAP — semua wallet fleet (Robinhood chain 4663)
 * WETH canonical RH: 0x[YOUR_WALLET_ADDRESS] (420K holders;
 * banyak copy-an "wETH" <200 holders di Blockscout search — JANGAN salah pilih)
 *
 * Usage:
 *   node weth-unwrap.js          # scan semua wallet aktif + unwrap yang ada WETH
 *   node weth-unwrap.js --scan   # cuma scan, tanpa unwrap
 */
const { ethers } = require('ethers');
const fs = require('fs');

const { getRpcs } = require('/home/ubuntu/mint-wallets/rpc-config.js');
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const WETH = '0x[YOUR_WALLET_ADDRESS]';
const LOG = '/home/ubuntu/mint-wallets/weth-unwrap.log';
const SCAN_ONLY = process.argv.includes('--scan');

function log(msg) { const l = `[${new Date().toISOString()}] ${msg}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); }
function readPk(walletId) {
  const env = fs.readFileSync(CONFIG.wallets[walletId].env, 'utf8');
  const m = env.match(/^PRIVATE_KEY=(\S+)$/m);
  if (!m) throw new Error('PK not found wallet ' + walletId);
  return m[1];
}

(async () => {
  const provider = new ethers.JsonRpcProvider(getRpcs().primary, 4663);
  const iface = new ethers.Interface([
    'function balanceOf(address) view returns (uint256)',
    'function withdraw(uint256 wad)',
  ]);
  log(`=== WETH UNWRAP ${SCAN_ONLY ? '(SCAN ONLY)' : ''} === ${WETH.slice(0, 10)}`);
  let totalWeth = 0n;
  for (const [id, w] of Object.entries(CONFIG.wallets)) {
    if (w.status !== 'active') continue;
    try {
      const raw = await provider.call({ to: WETH, data: iface.encodeFunctionData('balanceOf', [w.address]) });
      const wethBal = BigInt(iface.decodeFunctionResult('balanceOf', raw)[0]);
      totalWeth += wethBal;
      if (wethBal === 0n) { log(`wallet ${id}: WETH 0 — SKIP`); continue; }
      const wethEth = ethers.formatEther(wethBal);
      if (SCAN_ONLY) { log(`wallet ${id}: WETH ${wethEth} (scan only)`); continue; }

      log(`wallet ${id}: WETH ${wethEth} → unwrap…`);
      const data = iface.encodeFunctionData('withdraw', [wethBal]);
      await provider.call({ to: WETH, data, from: w.address }); // sim dulu
      const wallet = new ethers.Wallet(readPk(id), provider);
      const nonce = await provider.getTransactionCount(w.address, 'pending');
      const tx = await wallet.sendTransaction({
        to: WETH, data, chainId: 4663,
        maxFeePerGas: ethers.parseUnits('0.5', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
        type: 2, nonce, gasLimit: 150000n,
      });
      const rc = await tx.wait();
      log(`wallet ${id}: ✅ unwrap ${wethEth} ETH — ${tx.hash.slice(0, 18)} status ${rc.status === 1 ? 'OK' : 'REVERT'}`);
    } catch (e) {
      log(`wallet ${id}: ERROR ${String(e.shortMessage || e.message).slice(0, 100)}`);
    }
  }
  console.log(`\nTOTAL WETH fleet: ${ethers.formatEther(totalWeth)}`);
})();
