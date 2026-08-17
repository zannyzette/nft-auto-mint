#!/usr/bin/env python3
"""
Puzzle-mint sweep — bulk solve + claim for agentic-PoW puzzle mints (Inference Angels pattern).
Kinds handled: hunt, hidden, construct (multi-candidate). Extend `solvers` per project.

Usage:
  python3 puzzle-mint-sweep.py [start_band] [end_band] [max_claims]
  e.g. python3 puzzle-mint-sweep.py 4 19 40

Requirements:
  - Project repo cloned with miner/mine.js + corpus/v3/public/ + deploy.json (cwd = repo root)
  - Wordlist at corpus/v3/public/wordlist.json
  - Wallet PK at /home/ubuntu/mint-wallets/wallet-<N>/.env (PRIVATE_KEY= line), RPC from deploy.json
  - `npm install` already run in the repo (ethers needed by mine.js)

Pitfalls baked in:
  - Construct = MULTI-CANDIDATE: collect ALL hash-prefix hits, try each via solve until one mints.
  - Never check-then-claim-later: other agents claim within minutes; solve+claim in one pass.
  - The project's own `solve` validates against the on-chain hash (keccak-abi form) — don't
    reimplement the comparison; just try candidates.
"""
import json, hashlib, re, subprocess, os, sys, itertools

REPO = os.path.dirname(os.path.abspath(__file__))  # assume script lives in repo root
WORDS = json.load(open(os.path.join(REPO, 'corpus/v3/public/wordlist.json')))
WORDSET = set(WORDS)
DEPLOY = json.load(open(os.path.join(REPO, 'corpus/v3/deploy.json')))
os.environ['RPC_URL'] = DEPLOY.get('rpc') or DEPLOY.get('network', 'https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY][YOUR_ALCHEMY_KEY]')

WALLET_ID = os.environ.get('WALLET_ID', '1')
ENV = open(f'/home/ubuntu/mint-wallets/wallet-{WALLET_ID}/.env').read()
m = re.search(r'^PRIVATE_KEY=(\S+)$', ENV, re.M)
if not m:
    sys.exit('PRIVATE_KEY not found in wallet env')
os.environ['PRIVATE_KEY'] = m.group(1)

def solve_hunt(stmt):
    mm = re.search(r'SHA-256 digest whose lower-case hex begins with ([0-9a-f]+)', stmt)
    if not mm: return []
    p = mm.group(1)
    return [w for w in WORDS if hashlib.sha256(w.encode()).hexdigest().startswith(p)]

def solve_hidden(stmt):
    letters = None
    for mm in re.finditer(r'([a-z]{30,})', stmt):
        letters = mm.group(1)
    if not letters: return []
    for sp in range(1, 20):
        for start in range(sp):
            if letters[start::sp] in WORDSET:
                return [letters[start::sp]]
    return []

def solve_construct(stmt):
    mm = re.search(r'spell "([a-z]+)"', stmt)
    if not mm: return []
    acro = mm.group(1)
    mm2 = re.search(r'word lengths, in order, are ([0-9, ]+)', stmt)
    if not mm2: return []
    lens = [int(x) for x in re.findall(r'\d+', mm2.group(1))]
    mm3 = re.search(r'begins with ([0-9a-f]+)', stmt)
    if not mm3: return []
    prefix = mm3.group(1)
    if len(acro) != len(lens): return []
    cands = [[w for w in WORDS if len(w) == L and w[0] == ch] for L, ch in zip(lens, acro)]
    hits = []
    for combo in itertools.product(*cands):
        phrase = ' '.join(combo)
        if hashlib.sha256(phrase.encode()).hexdigest().startswith(prefix):
            hits.append(phrase)
            if len(hits) >= 5: break  # multi-candidate: cap, try each via solve
    return hits

SOLVERS = {'hunt': solve_hunt, 'hidden': solve_hidden, 'construct': solve_construct}

def claim(tid, answers):
    ansfile = f'/tmp/ans-{tid}.txt'
    open(ansfile, 'w').write('|'.join(answers))
    r = subprocess.run(['node', 'miner/mine.js', 'solve', str(tid), '--answers', ansfile],
                       capture_output=True, text=True, cwd=REPO, timeout=90)
    out = r.stdout + r.stderr
    if 'already claimed' in out: return 'claimed'
    if any(k in out.lower() for k in ('minted', 'success', 'confirmed')):
        return 'CLAIMED!'
    return 'no'

def main():
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 19
    cap = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    ok = attempted = 0
    for band in range(start, end + 1):
        f = os.path.join(REPO, 'corpus/v3/public', f'band-{band:02d}.json')
        try:
            d = json.load(open(f))
        except FileNotFoundError:
            continue
        items = d if isinstance(d, list) else d.get('angels', [d])
        for a in items:
            trials = a.get('trials') or []
            if len(trials) != 1: continue
            t = trials[0]
            kind = t.get('kind')
            if kind not in SOLVERS: continue
            try:
                cands = SOLVERS[kind](t.get('statement', ''))
            except Exception:
                cands = []
            if not cands: continue
            attempted += 1
            for ans in cands:
                res = claim(a.get('tokenId'), [ans])
                if res == 'CLAIMED!':
                    ok += 1
                    print(f'🎉 {a.get("tokenId")} ({kind}): CLAIMED! total={ok}', flush=True)
                    break
                if res == 'claimed':
                    break
            if ok >= cap:
                print(f'Cap {cap} reached', flush=True)
                return
        print(f'[band {band} done — claimed: {ok}]', flush=True)
    print(f'DONE: {ok} claimed from {attempted} attempts')

if __name__ == '__main__':
    main()
