#!/usr/bin/env node
// FLAG-FLIP POLL RACE — for mints that open on a transaction (setMintOpen), not a countdown.
// VERIFIED 15/15 on RWAKERS (2026-08-18) — see references/rwakers-flag-flip-race.md
// Pattern: pre-sign ALL txs up front → poll mintOpen() → Promise.all parallel fire on flip.
// EDIT: CA, ABI, MINT_PLAN, tier API URL, PK paths.
const { ethers } = require('/tmp/neon-sign/node_modules/ethers');
const fs = require('fs');

const CA = '0x[YOUR_WALLET_ADDRESS]'; // <-- contract
const CHAIN_ID = 4663; // Robinhood
const RPC = 'https://robinhood-mainnet.g.alchemy.com/v2/' + fs.readFileSync('/home/ubuntu/mint-wallets/.env','utf8').match(/ALCHEMY_KEY_1=(.+)/)[1].trim();
const WALLET_FILE = '/home/ubuntu/mint-wallets/wallets.json';
const PROOF_API = (addr) => `https://example.xyz/api/proof/${addr.toLowerCase()}`; // <-- tier/proof API

// NB: full signatures REQUIRED when the ABI has overloaded mint (else "ambiguous function description")
const ABI = [
  'function mintOpen() view returns (bool)',
  'function price() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function mint(uint256 qty) payable',
  'function mint(uint256 qty, bytes32[] proof) payable'
];

// walletIdx is 1-based into wallets.json; tier 'free' fetches merkle proof, 'public' pays price*qty
const MINT_PLAN = [
  { walletIdx: 1, qty: 1, tier: 'free' },
  { walletIdx: 2, qty: 3, tier: 'public' },
  // ...
];
const POLL_MS = 1500;
const GAS_LIMIT = 400000;
const MAX_FEE_GWEI = '0.5';   // ceiling = insurance, refunded on RH
const PRIORITY_GWEI = '0.01';
const EXPECTED_PRICE_ETH = '0.0005'; // price-flip guard

function getWallets() {
  // wallets.json = {leader, wallets: {"1": {address,...}, ...}} — DICT keyed numeric, not a list!
  const d = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  const raw = d.wallets;
  const addrs = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') addrs.push(item);
      else if (item?.address) addrs.push(item.address);
    }
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).sort((a, b) => Number(a) - Number(b)).forEach(k => {
      const item = raw[k];
      if (typeof item === 'string') addrs.push(item);
      else if (item?.address) addrs.push(item.address);
    });
  }
  return addrs;
}

function getSigner(provider, idx) {
  const content = fs.readFileSync(`/home/ubuntu/mint-wallets/wallet-${idx}/.env`, 'utf8');
  const m = content.match(/(?:PRIVATE_KEY|PK|WALLET_KEY)\s*=\s*(0x[0-9a-fA-F]{64})/);
  if (!m) throw new Error(`PK not found in wallet-${idx}/.env`);
  return new ethers.Wallet(m[1], provider);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(CA, ABI, provider);
  const wallets = getWallets();
  const price = await contract.price();
  if (ethers.formatEther(price) !== EXPECTED_PRICE_ETH) {
    console.log(`⚠️ PRICE MISMATCH: ${ethers.formatEther(price)} != ${EXPECTED_PRICE_ETH} — STOP`);
    process.exit(1);
  }

  console.log('Pre-signing...');
  const prepared = [];
  for (const plan of MINT_PLAN) {
    const addr = wallets[plan.walletIdx - 1];
    if (!addr) continue;
    const signer = getSigner(provider, plan.walletIdx);
    let value = 0n, data;
    if (plan.tier === 'free') {
      const d = await (await fetch(PROOF_API(addr))).json();
      const proofs = d.proof || (Array.isArray(d.proofs) ? d.proofs.flat() : []); // proof FLAT, proofs NESTED
      if (!proofs.length) { console.log(`SKIP w${plan.walletIdx}: no proof`); continue; }
      data = contract.interface.encodeFunctionData('mint(uint256,bytes32[])', [plan.qty, proofs]);
    } else {
      value = price * BigInt(plan.qty);
      data = contract.interface.encodeFunctionData('mint(uint256)', [plan.qty]);
    }
    prepared.push({ plan, signer, tx: { to: CA, data, value, gasLimit: GAS_LIMIT,
      maxFeePerGas: ethers.parseUnits(MAX_FEE_GWEI, 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits(PRIORITY_GWEI, 'gwei'), type: 2, chainId: CHAIN_ID } });
    console.log(`  w${plan.walletIdx} ${addr.slice(0,8)}.. qty=${plan.qty} value=${ethers.formatEther(value)} ${plan.tier} ✓`);
  }

  console.log(`Polling mintOpen every ${POLL_MS}ms...`);
  while (true) {
    let open = false;
    try { open = await contract.mintOpen(); } catch (e) {}
    if (open) {
      console.log(`🔥 MINT OPEN [${new Date().toISOString()}] — FIRING ${prepared.length} txs`);
      const p2 = await contract.price(); // price-flip guard re-read
      const results = await Promise.allSettled(prepared.map(async ({ plan, signer, tx }) => {
        if (plan.tier === 'public' && p2 * BigInt(plan.qty) !== tx.value) {
          return { wallet: plan.walletIdx, status: 'PRICE-FLIP STOP' };
        }
        const nonce = await signer.getNonce();
        const signed = await signer.signTransaction({ ...tx, nonce });
        const resp = await provider.broadcastTransaction(signed);
        return { wallet: plan.walletIdx, status: 'SENT', hash: resp.hash };
      }));
      for (const r of results) {
        const v = r.status === 'fulfilled' ? r.value : { status: 'FAIL', msg: r.reason?.message?.slice(0, 120) };
        console.log(`  w${v.wallet}: ${v.status} ${v.hash || ''} ${v.msg || ''}`);
      }
      await new Promise(r => setTimeout(r, 8000));
      for (const r of results) {
        if (r.status !== 'fulfilled' || r.value.status !== 'SENT') continue;
        const rc = await provider.getTransactionReceipt(r.value.hash);
        console.log(`  w${r.value.wallet}: ${rc ? (rc.status === 1 ? '✅ SUCCESS' : '❌ REVERT') : '⏳ pending'} ${r.value.hash}`);
      }
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
