#!/usr/bin/env python3
"""Push-aware EVM runtime bytecode scanner (scam check).

Naive scans for SELFDESTRUCT/DELEGATECALL grep 0xff/0xf4 raw and false-positive
hard: PUSH32 operands (addresses, merkle roots, constants) contain those bytes
as DATA, not opcodes. RWAKERS 2026-08-18: naive scan reported "SELFDESTRUCT
232x" on a clean contract; push-aware scan (this script) reported CLEAN.

Usage:
    python3 scan-bytecode-opcodes.py <rpc_url> <contract_address>
    # or: omit rpc_url to auto-build from ALCHEMY_KEY_1 in mint-wallets/.env

Exit code: 0 = clean, 1 = dangerous opcodes found (or error).
"""
import json
import os
import re
import sys
import urllib.request

DANGEROUS = {
    0xFF: "SELFDESTRUCT",
    0xF4: "DELEGATECALL",
    0xF5: "CALLCODE",
    0x3F: "EXTCODEHASH",  # usually benign (royalty/metadata checks)
}


def default_rpc():
    env_path = "/home/ubuntu/mint-wallets/.env"
    if os.path.exists(env_path):
        m = re.search(r"(?<=ALCHEMY_KEY_1=)\S+", open(env_path).read())
        if m:
            return f"https://robinhood-mainnet.g.alchemy.com/v2/{m.group(0)}"
    return None


def get_code(rpc, addr):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "eth_getCode", "params": [addr, "latest"]}
    ).encode()
    req = urllib.request.Request(rpc, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        code = json.load(r).get("result", "")
    return bytes.fromhex(code[2:]) if code.startswith("0x") else b""


def scan(bc):
    """Iterate opcodes, skipping PUSH operand bytes so data never false-positives."""
    found = {}
    pushes = 0
    i = 0
    while i < len(bc):
        b = bc[i]
        if 0x60 <= b <= 0x7F:  # PUSH1..PUSH32
            pushes += 1
            i += 1 + (b - 0x5F)  # skip operand
            continue
        if b in DANGEROUS:
            found.setdefault(DANGEROUS[b], []).append(i)
        i += 1
    return pushes, found


if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print(__doc__)
        sys.exit(2)
    addr = sys.argv[1] if len(sys.argv) == 2 else sys.argv[2]
    rpc = (default_rpc() if len(sys.argv) == 2 else sys.argv[1]) or sys.argv[1]
    try:
        bc = get_code(rpc, addr)
    except Exception as e:
        print(f"ERROR fetching code: {e}")
        sys.exit(1)
    print(f"contract: {addr}\nruntime: {len(bc)} bytes")
    pushes, found = scan(bc)
    print(f"PUSH instructions: {pushes}")
    if not found:
        print("CLEAN: no SELFDESTRUCT/DELEGATECALL/CALLCODE/EXTCODEHASH opcodes")
        sys.exit(0)
    for op, pos in found.items():
        print(f"{op}: {len(pos)}x at {pos[:10]}")
    bad = {k for k in found if k in ("SELFDESTRUCT", "DELEGATECALL", "CALLCODE")}
    if bad:
        print("WARNING: dangerous opcodes:", sorted(bad))
        sys.exit(1)
    if set(found) == {"EXTCODEHASH"}:
        print("EXTCODEHASH only — usually benign (royalty/metadata checks)")
    sys.exit(0)
