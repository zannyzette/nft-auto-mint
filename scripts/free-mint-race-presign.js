#!/usr/bin/env node
/**
 * Global-window free mint — Pre-Sign & Fire racing loop.
 *
 * For mints like Rentoids (Robinhood): "free, 1 per 5s GLOBAL window".
 * Beats the naive loop by pre-signing the constant mint(1) tx once per nonce
 * and firing exactly at the window boundary — 1 RPC call per attempt.
 *
 * Setup: .env with PRIVATE_KEY=0x... (chmod 600), CONTRACT + MINT_SIG + WINDOW below.
 * Usage:
 *   node free-mint-race.js --max 50              # fire at boundary
 *   node free-mint-race.js --max 50 --lead 150   # fire 150ms BEFORE boundary
 *
 * Honest expectations (verified on Rentoids 2026-08):
 *   - Win rate vs a dominant US-East bot: ~2-3% early, ~0% once hardened.
 *   - Lead mode can steal a slot when the dominant bot stumbles.
 *   - Hammering 2x rate trips RPC 403 rate limits — fire window-aligned only.
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.RPC_URL || "https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]";
const CONTRACT = process.env.CONTRACT || "";           // REQUIRED: mint contract
const MINT_SIG = process.env.MINT_SIG || "0xa0712d68"; // mint(uint256)
const WINDOW = parseInt(process.env.WINDOW || "5", 10); // seconds per free slot
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "4663", 10);

const args = process.argv.slice(2);
const maxMints = parseInt(args[args.indexOf("--max")+1]) || 50;
const LEAD_MS = parseInt(args[args.indexOf("--lead")+1]) || 0;

// Read PK
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

// Constant calldata: mint(1)
const calldata = MINT_SIG + "0000000000000000000000000000000000000000000000000000000000000001";

// Robinhood-style hardcoded gas (never trust getFeeData there)
const GAS = {
  gasLimit: 250000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
  type: 2,
};

let minted = 0, attempts = 0, lastNonce = null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function presign(nonce) {
  return wallet.signTransaction({
    to: CONTRACT, data: calldata, value: 0n, chainId: CHAIN_ID,
    ...GAS, nonce,
  });
}

async function fire(signedTx) {
  try {
    const hash = await provider.broadcastTransaction(signedTx);
    return { ok: true, hash: hash.hash };
  } catch (e) {
    return { ok: false, err: (e.shortMessage || e.message || "").toLowerCase().slice(0, 100) };
  }
}

async function waitForBoundary() {
  const now = Date.now();
  const target = now + (WINDOW * 1000 - (now % (WINDOW * 1000)));
  const waitMs = Math.max(0, target - Date.now() - LEAD_MS);
  await sleep(waitMs);
  while (Date.now() < target - LEAD_MS) { /* spin to boundary */ }
}

async function getWalletState() {
  const used = await new ethers.Contract(
    CONTRACT, ["function mintsPerWallet(address) view returns (uint256)"], provider
  ).mintsPerWallet(wallet.address);
  const nonce = await provider.getTransactionCount(wallet.address, "pending");
  return { used: Number(used), nonce };
}

async function main() {
  console.log(`=== PRE-SIGN & FIRE | wallet=${wallet.address} max=${maxMints} lead=${LEAD_MS}ms ===`);
  let { used, nonce } = await getWalletState();
  minted = used;
  console.log(`start: minted=${used} nonce=${nonce}`);
  if (used >= maxMints) { console.log("cap reached"); return; }

  while (minted < maxMints) {
    attempts++;
    let signed;
    try { signed = await presign(nonce); }
    catch (e) { console.log("presign err:", e.message); await sleep(1000); continue; }

    await waitForBoundary();
    const res = await fire(signed);
    if (res.ok) {
      console.log(`[${new Date().toISOString().slice(11,19)}] 🔥 nonce=${nonce} → ${res.hash.slice(0,18)}...`);
      await sleep(1200);
      try {
        const rcpt = await provider.getTransactionReceipt(res.hash);
        if (rcpt && rcpt.status === 1) { minted++; console.log(`  ✅ MINTED #${minted}`); }
        else { console.log(`  ⚠️ revert`); }
      } catch (e) { console.log(`  ? receipt fail`); }
      nonce++; // success or revert both consume nonce
    } else {
      if (res.err.includes("nonce") || res.err.includes("already known") || res.err.includes("replacement")) {
        try { nonce = await provider.getTransactionCount(wallet.address, "pending"); } catch {}
        console.log(`  ⚠️ nonce issue: ${res.err} → refresh nonce=${nonce}`);
      } else if (res.err.includes("403") || res.err.includes("forbidden") || res.err.includes("rate")) {
        console.log(`  ⛔ RPC rate-limited — backing off 30s`);
        await sleep(30000);
      } else {
        console.log(`  ⚠️ fire err: ${res.err}`);
        await sleep(500);
      }
    }

    if (attempts % 10 === 0) {
      try { const st = await getWalletState(); used = st.used; minted = used; console.log(`  [status] minted=${used} nonce=${st.nonce}`); } catch {}
    }
  }
  console.log(`\n=== DONE: ${minted} minted in ${attempts} attempts ===`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
