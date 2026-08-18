#!/usr/bin/env node
/**
 * Free-mint race script — Pre-Sign & Fire (boundary-aligned)
 *
 * For global free mints (1 slot per N-second window, FCFS).
 * Key insight: the mint tx is IDENTICAL every time (e.g. mint(1), value 0),
 * so sign once per nonce (pure local CPU), then fire eth_sendRawTransaction
 * exactly at the window boundary. Cuts RPC round-trips from 3-4 to 1.
 *
 * Generalize for any contract:
 *   - Change CONTRACT, MINT_SIG (mint selector), WINDOW (seconds per slot)
 *   - Keep calldata constant (same args every attempt)
 *   - Adjust GAS for the target chain (Robinhood: hardcode 0.15/0.01 gwei)
 *
 * Usage:
 *   node free-mint-race.js --max 32 --lead 150
 *   --lead N : fire N ms BEFORE the boundary (counter latency; 0-300)
 *
 * HARD TRUTH: this optimizes your side fully, but a bot with sub-50ms
 * latency to the sequencer (US-East VPS vs US chain) still wins ~99% of
 * windows. Check VPS region vs chain BEFORE committing to a long race.
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const CONTRACT = "0x[YOUR_WALLET_ADDRESS]"; // Rentoids
const MINT_SIG = "0xa0712d68";  // mint(uint256)

const args = process.argv.slice(2);
const maxMints = parseInt(args[args.indexOf("--max")+1]) || 50;
const LEAD_MS = parseInt(args[args.indexOf("--lead")+1]) || 0;
const WINDOW = 5;

const envPath = path.join(__dirname, ".env");
let PK = "";
try {
  const env = fs.readFileSync(envPath, "utf8");
  const m = env.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m);
  if (m) PK = m[1].trim();
} catch (e) { console.error("❌ .env tidak ditemukan"); process.exit(1); }
if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) { console.error("❌ PK invalid"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const WALLET_ADDR = wallet.address;

// Calldata konstan: mint(1)
const calldata = MINT_SIG + "0000000000000000000000000000000000000000000000000000000000000001";

const GAS = {
  gasLimit: 250000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
  type: 2,
};

let minted = 0;
let attempts = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function presign(nonce) {
  return wallet.signTransaction({
    to: CONTRACT, data: calldata, value: 0n, chainId: 4663, ...GAS, nonce,
  });
}

async function fire(signedTx) {
  try {
    const hash = await provider.broadcastTransaction(signedTx);
    return { ok: true, hash: hash.hash };
  } catch (e) {
    return { ok: false, err: (e.shortMessage || e.message || "").slice(0, 100) };
  }
}

function nextBoundary() {
  const now = Date.now();
  return now + (WINDOW * 1000 - (now % (WINDOW * 1000)));
}

async function waitForBoundary() {
  const target = nextBoundary();
  await sleep(Math.max(0, target - Date.now() - LEAD_MS));
  while (Date.now() < target - LEAD_MS) { /* spin */ }
}

async function getWalletState() {
  const used = await new ethers.Contract(CONTRACT, ["function mintsPerWallet(address) view returns (uint256)"], provider)
    .mintsPerWallet(WALLET_ADDR);
  const nonce = await provider.getTransactionCount(WALLET_ADDR, "pending");
  return { used: Number(used), nonce };
}

async function main() {
  console.log(`=== FREE MINT RACE — ${WALLET_ADDR} — max ${maxMints}, lead ${LEAD_MS}ms ===`);
  let { used, nonce } = await getWalletState();
  minted = used;
  console.log(`Start: minted=${used} nonce=${nonce}`);
  if (used >= maxMints) { console.log("Cap tercapai"); return; }

  while (minted < maxMints) {
    attempts++;
    let signed;
    try { signed = await presign(nonce); } catch (e) { await sleep(1000); continue; }

    await waitForBoundary();
    const res = await fire(signed);
    if (res.ok) {
      console.log(`[${new Date().toISOString().slice(11,19)}] 🔥 nonce=${nonce} → ${res.hash.slice(0,18)}...`);
      await sleep(1200);
      try {
        const rcpt = await provider.getTransactionReceipt(res.hash);
        if (rcpt && rcpt.status === 1) {
          minted++;
          console.log(`  ✅ MINTED #${minted}`);
        } else {
          console.log(`  ⚠️ revert (nonce ${nonce})`);
        }
      } catch {}
      nonce++;
    } else {
      if (res.err.includes("nonce") || res.err.includes("already known") || res.err.includes("replacement")) {
        try { nonce = await provider.getTransactionCount(WALLET_ADDR, "pending"); } catch {}
        console.log(`  ⚠️ nonce issue: ${res.err} → refresh nonce=${nonce}`);
      } else {
        console.log(`  ⚠️ fire err: ${res.err}`);
        await sleep(500);
      }
    }
    if (attempts % 10 === 0) {
      try {
        const st = await getWalletState();
        minted = st.used;
        console.log(`  [status] minted=${st.used} nonce=${st.nonce}`);
      } catch {}
    }
  }
  console.log(`\n=== SELESAI: ${minted} minted ===`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
