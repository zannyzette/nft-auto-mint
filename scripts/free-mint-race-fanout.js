#!/usr/bin/env node
/**
 * Free-mint race — Fan-out Multi-RPC (verified winner, Rentoids Aug 2026)
 *
 * WHY fan-out: broadcast the SAME pre-signed tx to several RPC endpoints
 * simultaneously. Whichever reaches the sequencer first wins the window.
 * Sweet spot (Jakarta/SG VPS → Robinhood chain): fire ~155-175ms BEFORE the
 * window boundary (timestamp % WINDOW == 0). Direct-inject RPCs need only
 * ~-165ms; relay-style RPCs need ~-800ms — prefer direct endpoints.
 *
 * Verified result: after single-RPC pre-sign got 0 wins / 170+ attempts,
 * fan-out at -165ms won +4 mints through the sold-out phase (35/50 wallet cap).
 *
 * Usage:
 *   node free-mint-race-fanout.js --max 50 --lead 165 [--window 5]
 *
 * Config via env / .env (same dir):
 *   PRIVATE_KEY=0x...   (chmod 600, never in chat)
 *   Optionally edit RPCS / CONTRACT / MINT_SIG below per project.
 *
 * NOTE: nonce desync is the #1 multi-RPC bug — always re-sync nonce + minted
 * from the canonical RPC after every fire (drpc.org may lag behind).
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ── Project config (generalize per mint) ──────────────────────────────────
const RPCS = [
  "https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp",
  "https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]",
].filter((v, i, a) => v && a.indexOf(v) === i);
const CONTRACT = "0x[YOUR_WALLET_ADDRESS]"; // Rentoids
const MINT_SIG = "0xa0712d68"; // mint(uint256) — constant calldata
const CHAIN_ID = 4663;         // Robinhood

const args = process.argv.slice(2);
const maxMints = parseInt(args[args.indexOf("--max") + 1]) || 50;
const LEAD_MS = parseInt(args[args.indexOf("--lead") + 1]) || 165;
const WINDOW = parseInt(args[args.indexOf("--window") + 1]) || 5;

// ── PK from .env (never printed) ──────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
let PK = "";
try {
  const env = fs.readFileSync(envPath, "utf8");
  const m = env.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m);
  if (m) PK = m[1].trim();
} catch (e) { console.error("❌ .env tidak ditemukan"); process.exit(1); }
if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) { console.error("❌ PK invalid"); process.exit(1); }

const wallet = new ethers.Wallet(PK);
const WALLET_ADDR = wallet.address;

// mint(1) — constant calldata, signable offline per nonce
const calldata = MINT_SIG + "0000000000000000000000000000000000000000000000000000000000000001";
const GAS = {
  gasLimit: 250000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),      // Robinhood: hardcode, refunded
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
  type: 2,
};

let minted = 0, attempts = 0, wins = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function presign(nonce) {
  return wallet.signTransaction({
    to: CONTRACT, data: calldata, value: 0n, chainId: CHAIN_ID, ...GAS, nonce,
  });
}

// Fire the SAME signed tx to all RPCs; any fulfilled = delivered
async function fanoutFire(signedTx) {
  const results = await Promise.allSettled(
    RPCS.map(async (rpc) => {
      const p = new ethers.JsonRpcProvider(rpc);
      const h = await p.broadcastTransaction(signedTx);
      return { rpc, hash: h.hash };
    })
  );
  const ok = results.filter(r => r.status === "fulfilled");
  return ok.length > 0
    ? { ok: true, results: ok.map(r => r.value.rpc) }
    : { ok: false, err: results[0]?.reason?.message || "all failed" };
}

function nextBoundary() {
  const now = Date.now();
  return now + (WINDOW * 1000 - (now % (WINDOW * 1000)));
}

async function waitForFireMoment() {
  const target = nextBoundary() - LEAD_MS;
  while (Date.now() < target) { /* spin — microsecond precision */ }
}

async function getWalletState() {
  const p = new ethers.JsonRpcProvider(RPCS[0]); // canonical RPC
  const used = await new ethers.Contract(
    CONTRACT, ["function mintsPerWallet(address) view returns (uint256)"], p
  ).mintsPerWallet(WALLET_ADDR);
  const nonce = await p.getTransactionCount(WALLET_ADDR, "pending");
  return { used: Number(used), nonce };
}

async function main() {
  console.log("=== FREE-MINT FAN-OUT RACE ===");
  console.log(`Wallet: ${WALLET_ADDR} | Lead: ${LEAD_MS}ms | Window: ${WINDOW}s | Fan-out: ${RPCS.length} RPC`);
  let { used, nonce } = await getWalletState();
  minted = used;
  console.log(`Start: minted=${used} nonce=${nonce}`);
  if (used >= maxMints) { console.log("Cap tercapai"); return; }

  while (minted < maxMints) {
    attempts++;
    let signed;
    try { signed = await presign(nonce); } catch (e) { console.log("presign err", e.message); await sleep(500); continue; }
    await waitForFireMoment();

    const res = await fanoutFire(signed);
    if (res.ok) {
      console.log(`[${new Date().toISOString().slice(11,19)}] 🔥 fire@-${LEAD_MS}ms nonce=${nonce} → ${res.results.join(",")}`);
      await sleep(1500);
      let st = null;
      try { st = await getWalletState(); } catch { /* ignore */ }
      if (st) {
        if (st.used > minted) { wins++; minted = st.used; console.log(`  ✅ WIN #${wins} — minted=${minted} (nonce ${nonce})`); }
        else { console.log(`  ⚠️ revert (nonce ${nonce})`); }
        nonce = st.nonce;
      } else { nonce++; }
    } else {
      // Nonce desync is THE multi-RPC bug — re-sync immediately
      if (/nonce|already|replacement/i.test(res.err)) {
        try { const st = await getWalletState(); nonce = st.nonce; minted = st.used; console.log(`  ⚠️ nonce desync → refresh nonce=${nonce} minted=${minted}`); }
        catch { await sleep(1000); }
      } else { console.log(`  ⚠️ fanout fail: ${res.err}`); await sleep(500); }
    }
  }
  console.log("\n=== SELESAI ===");
  console.log(`Total minted: ${minted} (${wins} win dari ${attempts} fire)`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
