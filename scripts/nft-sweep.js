#!/usr/bin/env node
/**
 * Neon-style agentic PoW NFT sweep — transfer ALL NFTs + remaining native to a cold wallet.
 *
 * Setup: in the same dir, a .env with:
 *   PRIVATE_KEY=0x...          (hot wallet key, chmod 600, never in chat)
 *   COLD_WALLET=0x...          (operator's main wallet — the sweep target)
 *   NFT_CONTRACT=0x...         (optional override; defaults to Neon Nodes on Robinhood)
 *   RPC_URL=...                (optional override)
 *
 * Usage:
 *   node neon-sweep.js            → sweep NFT + ETH
 *   node neon-sweep.js --nft-only → only NFTs (keep ETH for more mints)
 *   node neon-sweep.js --eth-only → only ETH
 *
 * Requires: npm install ethers  (or NODE_PATH pointing at an ethers install)
 * Gas: hardcoded for Robinhood L2 (single sequencer, EIP-1559 refunds unused ceiling).
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
let PK = "", COLD_WALLET = "";
let NFT_CONTRACT = "0x[YOUR_WALLET_ADDRESS]"; // Neon Nodes (Robinhood)
let RPC_URL = "https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]";
try {
  const env = fs.readFileSync(envPath, "utf8");
  const g = (k) => { const m = env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+)\\s*$`, "m")); return m ? m[1].trim() : ""; };
  PK = g("PRIVATE_KEY");
  COLD_WALLET = g("COLD_WALLET");
  if (g("NFT_CONTRACT")) NFT_CONTRACT = g("NFT_CONTRACT");
  if (g("RPC_URL")) RPC_URL = g("RPC_URL");
} catch (e) { console.error("❌ .env not found:", envPath); process.exit(1); }

if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) { console.error("❌ PRIVATE_KEY invalid"); process.exit(1); }
if (!/^0x[0-9a-fA-F]{40}$/.test(COLD_WALLET)) { console.error("❌ COLD_WALLET invalid — add it to .env"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PK, provider);
const cold = ethers.getAddress(COLD_WALLET);

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

const GAS = {
  gasLimit: 200000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
  type: 2,
};

const onlyNft = process.argv.includes("--nft-only");
const onlyEth = process.argv.includes("--eth-only");

async function sweepNfts() {
  const nft = new ethers.Contract(NFT_CONTRACT, ERC721_ABI, wallet);
  let balance;
  try { balance = await nft.balanceOf(wallet.address); } catch (e) { console.log("ℹ️  NFT balance check failed:", e.shortMessage || e.message); return 0; }
  if (balance === 0n) { console.log("ℹ️  No NFTs in hot wallet."); return 0; }
  console.log(`📦 NFTs found: ${balance.toString()}`);
  let swept = 0;
  for (let i = 0n; i < balance; i++) {
    try {
      const tokenId = await nft.tokenOfOwnerByIndex(wallet.address, i);
      if ((await nft.ownerOf(tokenId)).toLowerCase() !== wallet.address.toLowerCase()) continue;
      console.log(`→ Transfer NFT #${tokenId.toString()} → cold...`);
      const tx = await nft.safeTransferFrom(wallet.address, cold, tokenId, GAS);
      await tx.wait();
      console.log(`  ✅ #${tokenId.toString()} → ${cold.slice(0, 10)}... (${tx.hash.slice(0, 18)}...)`);
      swept++;
    } catch (e) { console.log(`  ⚠️  index ${i} failed:`, e.shortMessage || e.message); }
  }
  return swept;
}

async function sweepEth() {
  const bal = await provider.getBalance(wallet.address);
  const reserve = ethers.parseEther("0.00002"); // keep gas reserve for future mints
  const amount = bal - reserve;
  if (amount <= 0n) { console.log("ℹ️  ETH remainder too small to sweep."); return; }
  console.log(`→ Transfer ${ethers.formatEther(amount)} ETH → cold...`);
  const tx = await wallet.sendTransaction({ to: cold, value: amount, gasLimit: 50000, ...GAS });
  await tx.wait();
  console.log(`  ✅ ETH → ${cold.slice(0, 10)}... (${tx.hash.slice(0, 18)}...)`);
}

(async () => {
  console.log("=== NFT SWEEP ===");
  console.log("Hot :", wallet.address);
  console.log("Cold:", cold);
  console.log("");
  if (!onlyEth) await sweepNfts();
  if (!onlyNft) await sweepEth();
  const remain = await provider.getBalance(wallet.address);
  console.log(`\nDone. Hot wallet remaining: ${ethers.formatEther(remain)} ETH`);
})();
