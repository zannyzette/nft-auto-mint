#!/usr/bin/env node
// sync-wallets-json.js — scan wallet-*/ .env, hitung address dari PK, tambah/perbaiki wallets.json
// Aman: backup dulu ke wallets.json.bak; PK tidak pernah ditampilkan.
// Menambah entry baru DAN memperbaiki address yang berubah (PK diganti) — konsisten.
// Test tanpa menyentuh fleet asli: WM_BASE=/tmp/wmtest node sync-wallets-json.js
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const BASE = process.env.WM_BASE || '/home/ubuntu/mint-wallets';
const cfgPath = path.join(BASE, 'wallets.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

// Backup
fs.copyFileSync(cfgPath, cfgPath + '.bak');

let added = 0;
let updated = 0;
let errors = [];
for (let num = 1; num <= 30; num++) {
  const envPath = path.join(BASE, `wallet-${num}`, '.env');
  if (!fs.existsSync(envPath)) continue;
  const m = fs.readFileSync(envPath, 'utf8').match(/^PRIVATE_KEY=(\S+)$/m);
  if (!m) { errors.push(`wallet-${num}: .env tidak punya PRIVATE_KEY`); continue; }
  let addr;
  try { addr = new ethers.Wallet(m[1]).address; }
  catch (e) { errors.push(`wallet-${num}: PK tidak valid`); continue; }
  const key = String(num);
  if (!cfg.wallets[key]) {
    cfg.wallets[key] = {
      label: `Wallet ${num}`,
      address: addr,
      chain: 'robinhood',
      env: envPath,
      status: 'active'
    };
    added++;
  } else if (cfg.wallets[key].address.toLowerCase() !== addr.toLowerCase()) {
    // Address berubah (PK diganti) — perbaiki biar konsisten
    const old = cfg.wallets[key].address;
    cfg.wallets[key].address = addr;
    cfg.wallets[key].env = envPath;
    cfg.wallets[key].status = 'active';
    updated++;
    console.log(`  ↻ wallet-${num}: address diganti ${old} → ${addr}`);
  }
}

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log(`✅ wallets.json di-sync: ${added} wallet baru, ${updated} address diperbaiki. Total: ${Object.keys(cfg.wallets).length} wallet.`);
if (errors.length) console.log('⚠️  Perhatian:\n - ' + errors.join('\n - '));
