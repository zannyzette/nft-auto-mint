#!/usr/bin/env node
// SeaDrop FCFS race with scheduled start — pre-sign ALL wallets, then parallel-fire at T-0.
// Worked: TOADLINGS! (Robinhood, free mint, 10/wallet × 10 wallets = 100/100 minted, drop cap 1000).
// Flow: 1) read getPublicDrop.startTime  2) pre-sign every wallet (0 RPC at T-0)
//       3) poll chain block timestamp every 1s  4) Promise.all broadcast to both RPCs the instant ts >= start
//       5) verify receipts + getMintStats per wallet.
// Editable constants below. PK from per-wallet .env, NEVER printed. chainId 4663 explicit (ethers v6 signs 0 otherwise).
const {ethers} = require('ethers');
const fs = require('fs');

const {getRpcs} = require('/home/ubuntu/mint-wallets/rpc-config.js'); // {primary, backup, both[]}
const CONFIG = JSON.parse(fs.readFileSync('/home/ubuntu/mint-wallets/wallets.json', 'utf8'));
const NFT = '0x...';                                            // <-- NFT contract
const SEADROP = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';   // standard SeaDrop on Robinhood
const FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719'; // OpenSea fee collector — SeaDrop reverts FeeRecipientCannotBeZeroAddress on zero
const QTY = 10;                                                 // per-wallet qty (<= maxLimitPerWallet)
const GAS_LIMIT = 500000n;                                      // fixed: estimateGas reverts pre-open (NotActive)
const LOG = '/home/ubuntu/mint-wallets/seadrop-race.log';

const rpcs = getRpcs();
const providers = rpcs.both.map(u => new ethers.JsonRpcProvider(u));
const primary = providers[0];

const seadropIface = new ethers.Interface([
  'function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable',
]);
const nftIface = new ethers.Interface([
  'function getMintStats(address) view returns (uint256,uint256,uint256)',
  'function totalSupply() view returns (uint256)',
]);
const dropIface = new ethers.Interface([
  'function getPublicDrop(address) view returns (tuple(uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxLimitPerWallet, uint16 maxTokenSupplyForDrop, uint16 feeBps))',
]);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function readPk(envPath) {
  const env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^PRIVATE_KEY=(\S+)$/m);
  if (!m) throw new Error('PK not found in ' + envPath);
  if (!/^0x[0-9a-fA-F]{64}$/.test(m[1])) throw new Error('PK format invalid in ' + envPath);
  return m[1];
}

(async () => {
  log('=== SEADROP FCFS RACE START ===');

  const raw = await primary.call({to: SEADROP, data: dropIface.encodeFunctionData('getPublicDrop', [NFT])});
  const drop = dropIface.decodeFunctionResult('getPublicDrop', raw)[0];
  const start = Number(drop.startTime);
  log(`price=${ethers.formatEther(drop.mintPrice)} ETH maxPerWallet=${Number(drop.maxLimitPerWallet)} start=${new Date(start*1000).toISOString()} (${start - Math.floor(Date.now()/1000)}s)`);

  // Pre-sign semua wallet
  const signedTxs = [];
  for (const [id, w] of Object.entries(CONFIG.wallets)) {
    if (w.status !== 'active') continue;
    const wallet = new ethers.Wallet(readPk(w.env), primary);
    const calldata = seadropIface.encodeFunctionData('mintPublic', [NFT, FEE_RECIPIENT, w.address, QTY]);
    const nonce = await primary.getTransactionCount(w.address, 'pending');
    const signed = await wallet.signTransaction({
      to: SEADROP, data: calldata, value: 0n, chainId: 4663,
      maxFeePerGas: ethers.parseUnits('0.15', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      type: 2, nonce, gasLimit: GAS_LIMIT,
    });
    signedTxs.push({id, address: w.address, signed});
    log(`pre-sign wallet ${id} qty=${QTY} nonce=${nonce}`);
  }
  log(`TOTAL PRE-SIGN: ${signedTxs.length} wallet`);

  // Poll chain time
  let fireAt = null;
  while (!fireAt) {
    try {
      const ts = (await primary.getBlock('latest')).timestamp;
      if (ts >= start) fireAt = ts; else await new Promise(r => setTimeout(r, 1000));
    } catch(e) { await new Promise(r => setTimeout(r, 1000)); }
  }
  log(`🔥 FIRE at blockTime=${fireAt} — broadcast ${signedTxs.length} tx PARALLEL`);

  const results = await Promise.all(signedTxs.map(async ({id, address, signed}) => {
    try {
      const s = nftIface.decodeFunctionResult('getMintStats',
        await primary.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [address])}));
      if (Number(s[0]) >= QTY) return {id, status: 'already-minted'};
    } catch(e) {}
    let tx = null;
    for (const p of providers) { // fan-out: first RPC that accepts wins
      try { tx = (await p.broadcastTransaction(signed)).hash; break; } catch(e) {}
    }
    return {id, status: tx ? 'sent' : 'broadcast-fail', tx};
  }));
  for (const r of results) log(`wallet ${r.id}: ${r.status}${r.tx ? ' ' + r.tx.slice(0,18) : ''}`);

  await new Promise(r => setTimeout(r, 8000));
  for (const {id, tx} of results) {
    if (!tx) continue;
    let receipt = null;
    for (let i = 0; i < 12 && !receipt; i++) {
      for (const p of providers) {
        try { receipt = await p.getTransactionReceipt(tx); } catch(e) {}
        if (receipt) break;
      }
      if (!receipt) await new Promise(r => setTimeout(r, 2000));
    }
    if (!receipt) { log(`wallet ${id}: tx ${tx.slice(0,18)} belum konfirmasi — cek manual`); continue; }
    log(`wallet ${id}: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ REVERTED'} gas ${receipt.gasUsed}`);
  }

  for (const {id, address} of signedTxs) {
    try {
      const s = nftIface.decodeFunctionResult('getMintStats',
        await primary.call({to: NFT, data: nftIface.encodeFunctionData('getMintStats', [address])}));
      log(`FINAL wallet ${id}: minted=${s[0]}/${QTY}`);
    } catch(e) {}
  }
  log('=== DONE ===');
})();
