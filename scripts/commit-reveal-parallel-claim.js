const {ethers} = require('ethers');
const fs = require('fs');
const crypto = require('crypto');

const RPC = 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]';
const CONTRACT = '0x[YOUR_WALLET_ADDRESS]';
const env1 = fs.readFileSync('/home/ubuntu/mint-wallets/wallet-1/.env', 'utf8');
const PK = env1.match(/^PRIVATE_KEY=(\S+)$/m)[1];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const iface = new ethers.Interface([
  'function commit(bytes32)',
  'function commitBlock(bytes32) view returns (uint256)',
  'function commitMinBlocks() view returns (uint256)',
  'function mint(uint256,bytes,bytes32)',
  'function ownerOf(uint256) view returns (address)',
]);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

const SOLUTIONS = {
  3218: ['1db2295d728b1c8f903e9dcb0e48c6b81d70df8c06844abfa2e0bcf03a7e6c31', 'shealing dinamode'],
  3252: ['8355e223f7f3842871738e32f20386706184c527b4f1191f24c2603b0afa4c76', 'uncivil sometime'],
  3349: ['127629b571ecccbb02c7e686b098ff18b5f3c23c96bad5deb2c8100aab685dc8', 'batea dubash creamcup fronter'],
};
const ids = Object.keys(SOLUTIONS).map(Number);

(async () => {
  // 1. Siapkan semua
  const prep = [];
  for (const id of ids) {
    const ans = SOLUTIONS[id];
    const finalAnswer = sha(`${id}|${ans.join('|')}`);
    const answerBytes = ethers.toUtf8Bytes(finalAnswer);
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['address','uint256','bytes32','bytes'], [wallet.address, id, salt, answerBytes]));
    prep.push({id, commitment, answerBytes, salt});
    console.log(`angel ${id}: prepared`);
  }

  // 2. Commit semua (nonce berurutan)
  let nonce = await provider.getTransactionCount(wallet.address, 'pending');
  console.log('\nCOMMIT semua...');
  const commitBlocks = {};
  for (const p of prep) {
    const tx = {to: CONTRACT, data: iface.encodeFunctionData('commit', [p.commitment]), chainId: 4663,
      maxFeePerGas: ethers.parseUnits('0.5', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      type: 2, nonce: nonce++, gasLimit: 150000n};
    const signed = await wallet.signTransaction(tx);
    const sent = await provider.broadcastTransaction(signed);
    console.log(`  commit ${p.id}: ${sent.hash}`);
    const rc = await sent.wait(1, 60000);
    commitBlocks[p.id] = rc.blockNumber;
  }
  console.log('commit blocks:', JSON.stringify(commitBlocks));

  // 3. Tunggu semua commit cukup umur (60 blok dari masing-masing)
  const minB = 60;
  let maxTarget = 0;
  for (const id of ids) maxTarget = Math.max(maxTarget, commitBlocks[id] + minB);
  console.log(`\ntunggu sampai blok ${maxTarget}...`);
  while ((await provider.getBlockNumber()) < maxTarget) await new Promise(r => setTimeout(r, 500));
  console.log('wait selesai');

  // 4. REVEAL semua dengan NONCE FRESH
  nonce = await provider.getTransactionCount(wallet.address, 'pending');
  console.log('\nREVEAL semua (nonce fresh)...');
  for (const p of prep) {
    const tx = {to: CONTRACT, data: iface.encodeFunctionData('mint', [p.id, p.answerBytes, p.salt]), chainId: 4663,
      maxFeePerGas: ethers.parseUnits('0.5', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      type: 2, nonce: nonce++, gasLimit: 400000n};
    try {
      const signed = await wallet.signTransaction(tx);
      const sent = await provider.broadcastTransaction(signed);
      console.log(`  🔥 reveal ${p.id}: ${sent.hash}`);
    } catch (e) {
      console.log(`  reveal ${p.id} gagal: ${String(e.shortMessage || e.message).slice(0, 100)}`);
    }
  }

  // 5. Verifikasi
  await new Promise(r => setTimeout(r, 12000));
  let wins = 0;
  for (const p of prep) {
    try {
      const r = await provider.call({to: CONTRACT, data: iface.encodeFunctionData('ownerOf', [p.id])});
      const owner = iface.decodeFunctionResult('ownerOf', r)[0];
      const mine = owner.toLowerCase() === wallet.address.toLowerCase();
      console.log(`  angel ${p.id}: owner ${owner.slice(0, 12)}... ${mine ? '🎉🎉 MILIK KITA!' : '(bukan kita)'}`);
      if (mine) wins++;
    } catch (e) { console.log(`  angel ${p.id}: belum mint`); }
  }
  console.log(`\nTOTAL: ${wins}/${ids.length} claimed!`);
})();
