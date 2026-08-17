#!/usr/bin/env node
// add-wallets.js — Generate N wallet baru + setup .env (chmod 600) + update wallets.json
// PK tidak pernah keluar dari VPS — yang tampil cuma address (aman, gak lewat chat).
// Usage: node add-wallets.js <jumlah> [--dry]
// Catatan: NODE_PATH=/tmp/neon-sign/node_modules (etherson VPS); BASE sesuai layout fleet.
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const BASE = '/home/ubuntu/mint-wallets';
const COUNT = parseInt(process.argv[2] || '5', 10);
const DRY = process.argv.includes('--dry');

if (!COUNT || COUNT < 1 || COUNT > 20) {
  console.log('Usage: node add-wallets.js <jumlah 1-20> [--dry]');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'wallets.json'), 'utf8'));
const ws = cfg.wallets;
const nums = Object.keys(ws).map(Number);
const startNum = (nums.length ? Math.max(...nums) : 0) + 1;

const newWallets = [];
for (let i = 0; i < COUNT; i++) {
  const num = startNum + i;
  const w = ethers.Wallet.createRandom();
  if (!DRY) {
    const dir = path.join(BASE, `wallet-${num}`);
    fs.mkdirSync(dir, { recursive: true });
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, `PRIVATE_KEY=${w.privateKey}\n`, { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    ws[String(num)] = {
      label: `Wallet ${num}`,
      address: w.address,
      chain: 'robinhood',
      env: envPath,
      status: 'active'
    };
  }
  newWallets.push({ num, address: w.address });
}

if (!DRY) {
  // Backup dulu sebelum nulis
  fs.copyFileSync(path.join(BASE, 'wallets.json'), path.join(BASE, 'wallets.json.bak'));
  fs.writeFileSync(path.join(BASE, 'wallets.json'), JSON.stringify(cfg, null, 2));
  console.log(`✅ ${COUNT} wallet baru dibuat: ${startNum} - ${startNum + COUNT - 1}`);
  console.log('=== ADDRESS UNTUK TOP-UP ===');
  newWallets.forEach(x => console.log(`wallet ${x.num}: ${x.address}`));
  console.log('');
  console.log('💰 Top-up ETH ke address di atas (min $5/wallet = 0.0026 ETH @ $1911)');
  console.log('📋 Setelah top-up, bilang agent: "race 15 wallet" — agent yang restart.');
} else {
  console.log(`[DRY] Rencana: ${COUNT} wallet (${startNum} - ${startNum + COUNT - 1})`);
  newWallets.forEach(x => console.log(`  wallet ${x.num}: ${x.address}`));
  console.log('[DRY] Tidak ada file yang ditulis — aman.');
}
