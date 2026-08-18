#!/usr/bin/env node
/**
 * Eligibility scanner — cek semua wallet aktif di wallets.json untuk sebuah collection.
 * Usage:
 *   node check-eligible.js --nft 0x... [--gate 0xTokenOrNft...] [--wallets 1,2,5]
 *
 * - Selalu: getMintStats(wallet) → minted / limit (SeaDrop)
 * - Dengan --gate (token-gated stage): balanceOf(wallet) token/NFT syarat
 * - Catatan: signed/allowlist (mintSigned) eligibility = server-side signature,
 *   TIDAK bisa di-cek on-chain — bilang itu ke operator, jangan maksa.
 */
const {ethers} = require('ethers');
const fs = require('fs');

const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NFT = getArg('--nft', '');
const GATE = getArg('--gate', '');
const FILTER = getArg('--wallets', '').split(',').filter(Boolean);
if (!NFT) { console.error('❌ --nft wajib'); process.exit(1); }

const provider = new ethers.JsonRpcProvider('https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]-jhbFK5Vp');
const nftIface = new ethers.Interface([
  'function getMintStats(address) view returns (uint256 minted, uint256 totalMinted, uint256 maxSupply)',
]);
const ercIface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);

(async () => {
  let wallets = Object.entries(CONFIG.wallets).filter(([, w]) => w.status === 'active');
  if (FILTER.length) wallets = wallets.filter(([id]) => FILTER.includes(id));
  console.log('=== CEK ELIGIBLE ===');
  for (const [id, w] of wallets) {
    try {
      const raw = await provider.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [w.address])});
      const s = nftIface.decodeFunctionResult('getMintStats', raw);
      const line = [`wallet ${id}: minted=${s[0]}`, `totalMinted=${s[1]}`, `max=${s[2]}`];
      if (GATE) {
        try {
          const g = await provider.call({to: GATE, data: ercIface.encodeFunctionData('balanceOf', [w.address])});
          line.push(`gate_balance=${ercIface.decodeFunctionResult('balanceOf', g)[0].toString()}`);
        } catch(e) { line.push('gate:ERR'); }
      }
      console.log(line.join(' | '));
    } catch(e) {
      console.log(`wallet ${id}: ERR ${String(e.message).slice(0, 60)}`);
    }
  }
  console.log('\nPublic stage = eligible semua wallet (FCFS). Allowlist/signed = gak bisa dicek on-chain.');
})();
