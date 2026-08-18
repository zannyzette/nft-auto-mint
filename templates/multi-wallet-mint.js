#!/usr/bin/env node
/**
 * Multi-wallet mint loop — mint max affordable per wallet for a backend-signed
 * mint (Scatter /v1/mint pattern). Generalize per project.
 *
 * Setup:
 *   - wallets.json (see multi-wallet-distribute.js) 
 *   - per-wallet .env PRIVATE_KEY
 *
 * Usage:
 *   node multi-wallet-mint.js 1        # wallet 1 only
 *   node multi-wallet-mint.js all      # all active wallets
 *   node multi-wallet-mint.js 2,3,4    # specific wallets
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// === PER-PROJECT CONFIG (change these) ===
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const API = "https://api.scatter.art";           // mint API host
const COLLECTION = "0x...";                       // contract address
const LIST_ID = "...";                            // mint list id (from eligible-invite-lists)
const CHAIN_ID = 4663;
const PRICE_ETH = 0.0002;                         // per NFT
const MAX_QTY = 10;                               // wallet_limit
const GAS_RESERVE = 0.0005;                       // keep for gas
// ================================================

const WALLETS_DIR = "/home/ubuntu/mint-wallets";
const CONFIG = JSON.parse(fs.readFileSync(path.join(WALLETS_DIR, "wallets.json"), "utf8"));
const target = process.argv[2] || "1";
const wallets = CONFIG.wallets;

function readPK(id) {
  try {
    const env = fs.readFileSync(wallets[id].env, "utf8");
    const m = env.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m);
    if (m && /^0x[0-9a-fA-F]{64}$/.test(m[1].trim())) return m[1].trim();
  } catch (e) {}
  return null;
}

async function getMintTx(minter, qty) {
  const res = await fetch(`${API}/v1/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      collectionAddress: COLLECTION, chainId: CHAIN_ID, minterAddress: minter,
      lists: [{ id: LIST_ID, quantity: qty }],
    }),
  });
  const data = await res.json();
  if (!data.mintTransaction) throw new Error(`API: ${JSON.stringify(data).slice(0,200)}`);
  return data.mintTransaction;
}

async function mintWallet(id, pk) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const w = new ethers.Wallet(pk, provider);
  const addr = w.address;

  const bal = Number(await provider.getBalance(addr)) / 1e18;
  const qty = Math.min(MAX_QTY, Math.max(1, Math.floor((bal - GAS_RESERVE) / PRICE_ETH)));
  if (qty < 1) { console.log(`  ❌ Wallet ${id}: ${bal.toFixed(4)} ETH insufficient`); return "insufficient"; }

  // IMPORTANT: check on-chain minted count BEFORE re-running (duplicate-run guard)
  console.log(`  Balance ${bal.toFixed(4)} → mint ${qty} (${(qty*PRICE_ETH).toFixed(4)} ETH)`);
  const mintTx = await getMintTx(addr, qty);

  const nonce = await provider.getTransactionCount(addr, "pending");
  const tx = {
    to: mintTx.to, value: BigInt(mintTx.value), data: mintTx.data, chainId: CHAIN_ID,
    gasLimit: 400000,
    maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
    type: 2, nonce,
  };
  const signed = await w.signTransaction(tx);
  const sent = await provider.broadcastTransaction(signed);
  const rcpt = await sent.wait(90);
  console.log(rcpt.status === 1 ? `  ✅ MINTED ${qty}` : "  ❌ Reverted");
  return rcpt.status === 1 ? "success" : "reverted";
}

async function main() {
  console.log(`=== MULTI-WALLET MINT | target=${target} | max=${MAX_QTY}/wallet ===`);
  const ids = target === "all"
    ? Object.keys(wallets).filter(id => wallets[id].status === "active")
    : target.split(",").map(t => t.trim()).filter(id => wallets[id] && wallets[id].status === "active");

  const results = [];
  for (const id of ids) {
    const pk = readPK(id);
    if (!pk) { console.log(`  ⚠️ Wallet ${id} PK missing`); results.push({id, status:"no-pk"}); continue; }
    try { results.push({ id, status: await mintWallet(id, pk) }); }
    catch (e) { console.log(`  ❌ Wallet ${id}: ${e.message.slice(0,100)}`); results.push({id, status:"error"}); }
    await new Promise(r => setTimeout(r, 2000)); // rate-limit spacer
  }
  console.log("\n=== HASIL ===");
  results.forEach(r => console.log(`  Wallet ${r.id}: ${r.status}`));
}
main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
