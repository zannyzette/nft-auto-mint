#!/usr/bin/env node
/**
 * Multi-wallet balance distributor — leader wallet sends ETH to target wallets.
 * Reusable for any multi-wallet mint setup (Scatter, OpenSea, direct contract).
 *
 * Setup:
 *   - /home/ubuntu/mint-wallets/wallets.json → { leader, wallets: { "1": {address, env, status}, ... } }
 *   - each wallet .env → PRIVATE_KEY=0x... (chmod 600)
 *
 * Usage:
 *   node distribute.js 0.005 all        # leader → every active wallet
 *   node distribute.js 0.003 2,3,4      # leader → specific wallets
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.mainnet.chain.robinhood.com"; // change per chain
const WALLETS_DIR = "/home/ubuntu/mint-wallets";
const CONFIG = JSON.parse(fs.readFileSync(path.join(WALLETS_DIR, "wallets.json"), "utf8"));

const amountEth = parseFloat(process.argv[2]);
const targets = (process.argv[3] || "all").split(",").map(t => t.trim());
if (!amountEth || amountEth <= 0) {
  console.log("Usage: node distribute.js <amount_eth> <targets|all>");
  process.exit(1);
}

const wallets = CONFIG.wallets;
const SOURCE_ID = CONFIG.leader;

function readPK(id) {
  try {
    const env = fs.readFileSync(wallets[id].env, "utf8");
    const m = env.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m);
    if (m && /^0x[0-9a-fA-F]{64}$/.test(m[1].trim())) return m[1].trim();
  } catch (e) {}
  return null;
}

async function main() {
  const srcPK = readPK(SOURCE_ID);
  if (!srcPK) { console.log(`❌ Leader wallet ${SOURCE_ID} PK missing`); process.exit(1); }

  const provider = new ethers.JsonRpcProvider(RPC);
  const src = new ethers.Wallet(srcPK, provider);
  const srcAddr = src.address;

  const destIds = targets[0] === "all"
    ? Object.keys(wallets).filter(id => id !== SOURCE_ID && wallets[id].status === "active")
    : targets.filter(id => id !== SOURCE_ID && wallets[id] && wallets[id].status === "active");

  if (destIds.length === 0) { console.log("❌ No active target wallets"); process.exit(1); }

  const srcBal = await provider.getBalance(srcAddr);
  const totalNeeded = ethers.parseEther((amountEth * destIds.length).toFixed(6));
  const gasReserve = ethers.parseEther("0.001");
  console.log(`Sumber: ${srcAddr.slice(0,10)}... bal=${ethers.formatEther(srcBal)}`);
  console.log(`Kirim ${amountEth} ETH ke ${destIds.length} wallet`);

  if (srcBal < totalNeeded + gasReserve) {
    console.log(`❌ Insufficient: need ${ethers.formatEther(totalNeeded + gasReserve)}`); 
    process.exit(1);
  }

  const nonce = await provider.getTransactionCount(srcAddr, "pending");
  let i = 0;
  for (const id of destIds) {
    const pk = readPK(id);
    if (!pk) { console.log(`  ⚠️ Wallet ${id} PK missing — skip`); continue; }
    const dest = new ethers.Wallet(pk).address;
    const tx = {
      to: dest, value: ethers.parseEther(amountEth.toFixed(6)), chainId: 4663,
      gasLimit: 50000,
      maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
      type: 2, nonce: nonce + i,
    };
    try {
      const signed = await src.signTransaction(tx);
      const sent = await provider.broadcastTransaction(signed);
      console.log(`  ✅ Wallet ${id} ← ${amountEth} ETH | ${sent.hash.slice(0,18)}...`);
    } catch (e) { console.log(`  ❌ Wallet ${id}: ${(e.message||"").slice(0,80)}`); }
    i++;
  }
}
main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
