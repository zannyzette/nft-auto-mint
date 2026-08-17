#!/usr/bin/env node
/**
 * Free Mint Race Loop — for mints with a GLOBAL per-window free slot cap
 * (e.g. Rentoids: 1 free mint per 5s window, shared by ALL minters).
 *
 * Worked example: OnChainLandlord.sol on Robinhood chain
 *   contract 0x[YOUR_WALLET_ADDRESS]
 *   FREE_PER_BLOCK=1, FREE_WINDOW=5, WALLET_LIMIT=50, MAX_PER_TX=10
 *
 * Expected reality: ~3% win rate vs other bots. One wallet caps at 50.
 *
 * Usage:
 *   node free-mint-race-loop.js [--max N] [--interval 5] [--contract 0x...]
 *
 * Env: .env with PRIVATE_KEY (chmod 600). Ethers v6: NODE_PATH=<ethers dir>
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = "https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]";
const DEFAULT_CONTRACT = "0x[YOUR_WALLET_ADDRESS]";

const args = process.argv.slice(2);
const maxMints = parseInt(args[args.indexOf("--max") + 1]) || 50;
const interval = parseInt(args[args.indexOf("--interval") + 1]) || 5;
const CONTRACT = args[args.indexOf("--contract") + 1] || DEFAULT_CONTRACT;

// Read PK from .env (same dir)
const envPath = path.join(__dirname, ".env");
let PK = "";
try {
  const env = fs.readFileSync(envPath, "utf8");
  const m = env.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m);
  if (m) PK = m[1].trim();
} catch (e) {
  console.error("❌ .env tidak ditemukan di", envPath);
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) {
  console.error("❌ PRIVATE_KEY invalid di .env");
  process.exit(1);
}

const MINT_ABI = [
  "function mint(uint256 count) external payable",
  "function mintsPerWallet(address) external view returns (uint256)",
  "function nextTokenId() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const contract = new ethers.Contract(CONTRACT, MINT_ABI, wallet);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Robinhood chain: hardcode EIP-1559 (getFeeData() returns garbage there)
const GAS = {
  gasLimit: 250000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
  type: 2,
};

let minted = 0;
let attempts = 0;

async function tryMint() {
  attempts++;
  try {
    const used = await contract.mintsPerWallet(wallet.address);
    if (used >= BigInt(maxMints) || used >= 50n) {
      console.log(`\n🏁 Cap tercapai (${used} mint). Selesai.`);
      return "done";
    }

    // Dry-run first: see exact revert reason WITHOUT burning a tx
    try {
      await contract.mint.staticCall(1n, { from: wallet.address, value: 0n });
    } catch (e) {
      const msg = (e.shortMessage || e.message || "").toLowerCase();
      if (msg.includes("free slots full")) return "slot-full";
      if (msg.includes("sold out")) return "soldout";
      if (msg.includes("mint closed") || msg.includes("not open")) return "closed";
      if (msg.includes("wallet limit")) return "done";
      console.log(`  ⚠️ dry-run: ${msg.slice(0, 100)}`);
      return "error";
    }

    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    console.log(`[${new Date().toISOString().slice(11, 19)}] 🔨 try #${attempts} (minted ${minted}, wallet ${used})...`);
    const tx = await contract.mint(1n, { ...GAS, nonce, value: 0n });
    const rcpt = await tx.wait(60);
    if (rcpt.status === 1) {
      minted++;
      console.log(`  ✅ MINTED #${minted} | sisa ${maxMints - minted}`);
      return "ok";
    }
    return "revert";
  } catch (e) {
    const msg = (e.shortMessage || e.message || "").toLowerCase();
    if (msg.includes("free slots full")) return "slot-full";
    if (msg.includes("sold out")) return "soldout";
    if (msg.includes("nonce") || msg.includes("replacement") || msg.includes("already known")) return "nonce";
    console.log(`  ⚠️ ${msg.slice(0, 120)}`);
    return "error";
  }
}

async function main() {
  console.log("=== FREE MINT RACE LOOP ===");
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Max: ${maxMints} | Interval: ${interval}s | Contract: ${CONTRACT}`);
  console.log("");

  while (minted < maxMints) {
    const result = await tryMint();
    if (result === "done" || result === "soldout") break;
    await sleep(result === "ok" ? interval * 1000 : 2000);
  }

  console.log(`\n=== SELESAI ===\nTotal minted: ${minted} (attempts ${attempts})`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
