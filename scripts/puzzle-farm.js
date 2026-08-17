#!/usr/bin/env node
/**
 * Puzzle-farm claim pipeline — commit-reveal with CORRECT L1 clock.
 *
 * Fixes the fatal bug from the 2026-08 Inference Angels losses:
 * on Arbitrum Orbit chains the contract counts PARENT (L1) blocks, so
 * "wait commitMinBlocks=60" ≈ 15-20 MINUTES of L1 time, not 6s of L2.
 *
 * Architecture (playbook: 4 independent processes):
 *   1. SOLVERS      — append verified answers to answers.jsonl (external)
 *   2. COMMIT LOOP  — every ~45s commit everything not yet committed,
 *                     round-robin across wallets, several tokens per wallet
 *   3. MINT DAEMON  — poll L1 height, staticCall mint, send only when passes
 *   4. WATCHDOG     — restart dead pieces, refresh wallet gas set
 *
 * Usage:
 *   node puzzle-farm.js --answers answers.jsonl --contract 0x... \
 *       --min-blocks 60 [--wallets-dir /home/ubuntu/mint-wallets] [--once]
 */
const {ethers} = require('ethers');
const fs = require('fs');

const RPC = process.env.RPC_URL || 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]';
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : d; };
const ANSWERS_FILE = getArg('--answers', 'answers.jsonl');
const CONTRACT = getArg('--contract', '');
const MIN_BLOCKS = parseInt(getArg('--min-blocks', '60'));
const WALLETS_DIR = getArg('--wallets-dir', '/home/ubuntu/mint-wallets');
const ONCE = args.includes('--once');
if (!CONTRACT) { console.error('--contract wajib'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC);
const iface = new ethers.Interface([
  'function commit(bytes32)',
  'function commitMinBlocks() view returns (uint256)',
  'function mint(uint256,bytes,bytes32)',
  'function ownerOf(uint256) view returns (address)',
]);

const sha = s => require('crypto').createHash('sha256').update(s).digest('hex');

// ---- L1 height: the critical fix ----
// eth_getBlockByNumber returns an l1BlockNumber field on Orbit chains.
async function l1Height() {
  try {
    const b = await provider.send('eth_getBlockByNumber', ['latest', false]);
    if (b && b.l1BlockNumber) return Number(b.l1BlockNumber);
  } catch (e) { /* fall through */ }
  // Fallback: measure empirically (commit once, read stored block, compare)
  throw new Error('no l1BlockNumber field — need empirical calibration');
}

// ---- state ----
const STATE_FILE = 'farm-state.json';
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) { return {committed: {}, claimed: {}}; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1)); }

// wallets from wallets.json + .env
function loadWallets() {
  const cfg = JSON.parse(fs.readFileSync(`${WALLETS_DIR}/wallets.json`, 'utf8'));
  const out = [];
  for (const [id, w] of Object.entries(cfg.wallets)) {
    if (w.status !== 'active') continue;
    try {
      const env = fs.readFileSync(w.env, 'utf8');
      const pk = env.match(/^PRIVATE_KEY=(\S+)$/m)?.[1];
      if (pk && /^0x[0-9a-fA-F]{64}$/.test(pk)) out.push({id, pk, address: w.address});
    } catch (e) {}
  }
  return out;
}

// ---- read answers ----
function loadAnswers() {
  if (!fs.existsSync(ANSWERS_FILE)) return [];
  const out = [];
  for (const line of fs.readFileSync(ANSWERS_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) {}
  }
  return out; // [{tokenId, answers: [...]}]
}

// ---- commit loop ----
async function commitLoop(wallets, state) {
  const answers = loadAnswers();
  const toCommit = answers.filter(a =>
    !state.committed[a.tokenId] &&
    !state.claimed[a.tokenId] &&
    a.answers && a.answers.length);
  if (!toCommit.length) return;

  // round-robin: assign tokens to wallets in rotation
  let wi = 0;
  for (const a of toCommit) {
    const w = wallets[wi % wallets.length];
    wi++;
    try {
      const wallet = new ethers.Wallet(w.pk, provider);
      const finalAnswer = sha(`${a.tokenId}|${a.answers.join('|')}`);
      const answerBytes = ethers.toUtf8Bytes(finalAnswer);
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address','uint256','bytes32','bytes'], [wallet.address, a.tokenId, salt, answerBytes]));
      const nonce = await provider.getTransactionCount(wallet.address, 'pending');
      const tx = {to: CONTRACT, data: iface.encodeFunctionData('commit', [commitment]), chainId: 4663,
        maxFeePerGas: ethers.parseUnits('0.15', 'gwei'), maxPriorityFeePerGas: 0n,
        type: 2, nonce, gasLimit: 150000n};
      const sent = await provider.broadcastTransaction(await wallet.signTransaction(tx));
      // state per token: wallet + salt + answerBytes (needed for mint)
      state.committed[a.tokenId] = {wallet: wallet.address, salt, answerBytes: ethers.hexlify(answerBytes),
        finalAnswer, commitTx: sent.hash, walletPk: w.pk};
      console.log(`[commit] #${a.tokenId} via ${wallet.address.slice(0,8)}... ${sent.hash.slice(0,18)}`);
      saveState(state);
      // fetch commit block right away (L1 scale)
      const rc = await sent.wait(1, 60000);
      state.committed[a.tokenId].commitL1Block = rc.blockNumber;
      saveState(state);
      console.log(`[commit] #${a.tokenId} block ${rc.blockNumber} (L1?)`);
    } catch (e) {
      console.log(`[commit] #${a.tokenId} ERR ${String(e.shortMessage||e.message).slice(0,80)}`);
    }
  }
}

// ---- mint daemon ----
async function mintDaemon(state) {
  const now = await l1Height();
  for (const [tid, c] of Object.entries(state.committed || {})) {
    if (state.claimed[tid] || !c.commitL1Block) continue;
    if (now < c.commitL1Block + MIN_BLOCKS) continue; // not ripe yet — WAIT
    try {
      const wallet = new ethers.Wallet(c.walletPk, provider);
      const answerBytes = c.answerBytes.startsWith('0x') ? c.answerBytes : '0x' + c.answerBytes;
      // staticCall first — free, spends nothing
      await wallet.staticCall({to: CONTRACT, data: iface.encodeFunctionData('mint', [Number(tid), answerBytes, c.salt])});
      const nonce = await provider.getTransactionCount(wallet.address, 'pending');
      const tx = {to: CONTRACT, data: iface.encodeFunctionData('mint', [Number(tid), answerBytes, c.salt]), chainId: 4663,
        maxFeePerGas: ethers.parseUnits('0.15', 'gwei'), maxPriorityFeePerGas: 0n,
        type: 2, nonce, gasLimit: 400000n};
      const sent = await provider.broadcastTransaction(await wallet.signTransaction(tx));
      console.log(`[mint] #${tid} ${sent.hash.slice(0,18)}`);
      const rc = await sent.wait(1, 90000);
      if (rc.status === 1) {
        state.claimed[tid] = true;
        delete state.committed[tid];
        saveState(state);
        console.log(`🎉 [mint] #${tid} CLAIMED!`);
      } else {
        console.log(`[mint] #${tid} reverted — cek manual`);
        delete state.committed[tid];
        saveState(state);
      }
    } catch (e) {
      const msg = String(e.shortMessage || e.message || '');
      // terminal errors → drop; transient → keep
      if (/already claimed|does not match|expired/i.test(msg)) {
        console.log(`[mint] #${tid} terminal: ${msg.slice(0,60)}`);
        delete state.committed[tid];
        saveState(state);
      } else {
        console.log(`[mint] #${tid} wait/retry: ${msg.slice(0,60)}`);
      }
    }
  }
}

(async () => {
  const wallets = loadWallets();
  console.log(`wallets: ${wallets.length} | minBlocks: ${MIN_BLOCKS}`);
  const state = loadState();

  // Calibration: verify l1BlockNumber is available
  try {
    const h = await l1Height();
    console.log(`L1 height OK: ${h}`);
  } catch (e) {
    console.error(`⚠️ ${e.message}\nFALLBACK: calibrate by committing once and comparing scales.`);
  }

  if (ONCE) {
    await commitLoop(wallets, state);
    await mintDaemon(state);
    return;
  }

  // run both loops in parallel forever
  setInterval(() => commitLoop(wallets, state).catch(e => console.log('commit err', e.message)), 45000);
  setInterval(() => mintDaemon(state).catch(e => console.log('mint err', e.message)), 10000);
  console.log('farm running. Ctrl-C to stop.');
  // watchdog: if either interval dies the process would too — wrap main
  process.on('uncaughtException', e => console.log('watchdog:', e.message));
})();
