#!/usr/bin/env node
/**
 * revoke-approvals.js — Cabut izin (approve/allowance) setelah selesai dengan project.
 * Workflow operator (2026-08-15): "kalo gw udah selesai dengan project tersebut
 * gw bakalan minta revoke seperti ini" — jalankan script ini setelah project selesai.
 *
 * Fungsi:
 *  1. ERC-20: set allowance ke 0 (approve(spender, 0))
 *  2. ERC-721/1155: setApprovalForAll(operator, false)
 *
 * Usage:
 *  node revoke-approvals.js --erc20 <tokenAddr> --spender <spenderAddr> [--wallets 1-10]
 *  node revoke-approvals.js --nft <nftAddr> --operator <opAddr> [--wallets 1-10]
 *  node revoke-approvals.js --audit --erc20 <token> --spender <addr>   ← cek dulu tanpa revoke
 */
const { ethers } = require('ethers');
const fs = require('fs');

const CHAIN_ID = 4663;
const RPC = 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]'; // canonical utama (gratis, tanpa rate-limit)
const GAS = { gasLimit: 80000, maxFeePerGas: ethers.parseUnits('0.5','gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01','gwei'), type: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : null; };

const cfg = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const p = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });

const erc20ABI = ['function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)'];
const nftABI = ['function isApprovedForAll(address,address) view returns (bool)','function setApprovalForAll(address,bool)'];

async function main() {
  const walletsArg = getArg('--wallets') || '1,2,3,4,5,6,7,8,9,10';
  const ids = walletsArg.split(',');
  const mode = args.includes('--audit') ? 'audit' : (getArg('--erc20') ? 'erc20' : (getArg('--nft') ? 'nft' : 'audit'));

  const tokenAddr = getArg('--erc20') || getArg('--nft');
  const spender = getArg('--spender') || getArg('--operator');
  if (mode !== 'audit' && (!tokenAddr || !spender)) {
    console.log('Usage: --erc20 <token> --spender <addr> ATAU --nft <nft> --operator <addr> ATAU --audit');
    process.exit(1);
  }

  if (mode === 'audit') {
    console.log('🔍 AUDIT MODE — cek allowance tanpa revoke');
    if (getArg('--erc20')) await auditERC20(tokenAddr, spender, ids);
    else if (getArg('--nft')) await auditNFT(tokenAddr, spender, ids);
    else console.log('Kasih --erc20 <token> --spender <addr> atau --nft <nft> --operator <addr> buat audit spesifik');
    return;
  }

  const contract = new ethers.Contract(tokenAddr, mode === 'erc20' ? erc20ABI : nftABI, p);
  console.log(`🔒 REVOKE ${mode === 'erc20' ? 'ERC-20' : 'NFT'} | token ${tokenAddr.slice(0,12)}... | ${mode === 'erc20' ? 'spender' : 'operator'} ${spender.slice(0,12)}...`);

  for (const id of ids) {
    const w = cfg.wallets[id];
    if (!w) continue;
    const pk = fs.readFileSync(w.env, 'utf8').match(/^PRIVATE_KEY=(\S+)$/m)[1];
    const wallet = new ethers.Wallet(pk);
    try {
      let current;
      if (mode === 'erc20') current = await contract.allowance(wallet.address, spender);
      else current = await contract.isApprovedForAll(wallet.address, spender);
      if (mode === 'erc20' && current === 0n) { console.log(`wallet ${id}: sudah 0 — skip`); continue; }
      if (mode === 'nft' && !current) { console.log(`wallet ${id}: sudah false — skip`); continue; }

      const data = mode === 'erc20'
        ? contract.interface.encodeFunctionData('approve', [spender, 0n])
        : contract.interface.encodeFunctionData('setApprovalForAll', [spender, false]);
      const nonce = await p.getTransactionCount(wallet.address, 'pending');
      const signed = await wallet.signTransaction({ to: tokenAddr, data, value: 0n, chainId: CHAIN_ID, ...GAS, nonce });
      const h = await p.broadcastTransaction(signed);
      console.log(`wallet ${id}: 🔥 revoke tx ${h.hash.slice(0,20)}`);

      let rc = null;
      for (let i = 0; i < 10 && !rc; i++) { await sleep(2000); try { rc = await p.getTransactionReceipt(h.hash); } catch (e) {} }
      if (rc) console.log(`  ${rc.status === 1 ? '✅ REVOKED' : '❌ REVERT'} (gas ${rc.gasUsed.toString()})`);
      else console.log(`  ⏳ pending...`);
    } catch (e) {
      console.log(`wallet ${id}: ERR ${(e.shortMessage || e.message || '').slice(0, 90)}`);
    }
    await sleep(1000);
  }
  console.log('\n=== SELESAI REVOKE ===');
}

async function auditERC20(tokenAddr, spender, ids) {
  const c = new ethers.Contract(tokenAddr, erc20ABI, p);
  let found = false;
  for (const id of ids) {
    const w = cfg.wallets[id];
    if (!w) continue;
    try {
      const allow = await c.allowance(w.address, spender);
      if (allow > 0n) { found = true; console.log(`wallet ${id}: ⚠️ allowance=${allow.toString()}`); }
    } catch (e) {}
  }
  if (!found) console.log('✅ bersih — allowance 0 semua');
}

async function auditNFT(tokenAddr, spender, ids) {
  const c = new ethers.Contract(tokenAddr, nftABI, p);
  let found = false;
  for (const id of ids) {
    const w = cfg.wallets[id];
    if (!w) continue;
    try {
      if (await c.isApprovedForAll(w.address, spender)) { found = true; console.log(`wallet ${id}: ⚠️ approved`); }
    } catch (e) {}
  }
  if (!found) console.log('✅ bersih — gak ada approval');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
