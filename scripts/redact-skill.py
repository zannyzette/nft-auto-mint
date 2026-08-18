#!/usr/bin/env python3
"""Bikin salinan public skill nft-auto-mint — redact semua secret.
Output: ~/nft-skill-public/ (aman buat di-upload ke GitHub)
- Alchemy keys → alch_[YOUR_ALCHEMY_KEY]
- Wallet addresses asli → 0x[YOUR_WALLET]
- RPC URLs dengan key → tanpa key
- Private keys (0x64hex) → dummy
PENTING: skill asli di ~/.hermes/skills/ TIDAK disentuh — key tetap kepake.
Jalankan: python3 redact-skill.py
Verifikasi setelahnya: grep -rhoE "alch_[A-Za-z0-9]{8,}" ~/nft-skill-public/ | wc -l  (harus 0)
"""
import os, re, shutil

SRC = os.path.expanduser('~/.hermes/skills/nft/nft-auto-mint')
DST = os.path.expanduser('~/nft-skill-public')

if os.path.exists(DST):
    shutil.rmtree(DST)
shutil.copytree(SRC, DST)

EXCLUDE = ['__pycache__']

# Address publik yang AMAN dipertahankan (bukan rahasia)
PUBLIC_ADDRS = {
    '0x0000000000000000000000000000000000000000',
    '0xffffffffffffffffffffffffffffffffffffffff',
    '0x0000a26b00c1f0df003000390027140000faa719',   # OpenSea fee collector
    '0x00005ea00ac477b1030ce78506496e8c2de24bf5',   # SeaDrop singleton
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',   # native placeholder
}

def redact(path):
    with open(path, 'r', errors='ignore') as f:
        content = f.read()
    orig = content
    content = re.sub(r'alch_[A-Za-z0-9]{8,}', 'alch_[YOUR_ALCHEMY_KEY]', content)
    content = re.sub(r'(https://robinhood-mainnet\.g\.alchemy\.com/v2/)[A-Za-z0-9_\-]+', r'\1[YOUR_KEY]', content)
    def repl_addr(m):
        return m.group(0) if m.group(0).lower() in PUBLIC_ADDRS else '0x[YOUR_WALLET_ADDRESS]'
    content = re.sub(r'0x[0-9a-fA-F]{40}', repl_addr, content)
    content = re.sub(r'0x[0-9a-fA-F]{64}', '0x[YOUR_PRIVATE_KEY]', content)
    if content != orig:
        with open(path, 'w') as f:
            f.write(content)
        return True
    return False

changed = 0
for root, dirs, files in os.walk(DST):
    dirs[:] = [d for d in dirs if d not in EXCLUDE]
    for fname in files:
        fpath = os.path.join(root, fname)
        if fname.endswith(('.md', '.js', '.ts', '.py', '.sh', '.mjs', '.cu', '.json', '.yaml', '.yml', '.txt')):
            if redact(fpath):
                changed += 1

print(f"✅ Salinan public dibuat: {DST}")
print(f"   File di-redact: {changed}")
