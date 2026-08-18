#!/usr/bin/env python3
"""
Push-aware EVM bytecode opcode scanner.
Membedakan opcode ASLI (SELFDESTRUCT/DELEGATECALL/CALLCODE/EXTCODEHASH) dari byte
0xff/0xf4 yang cuma DATA di dalam operand PUSH1..PUSH32 (false positive kalau grep mentah).

Usage:
  python3 bytecode-opcode-scan.py 0x<CA> [rpc_url]      # fetch eth_getCode + scan
  python3 bytecode-opcode-scan.py --file code.hex        # scan dari file hex (0x... atau raw)
  python3 bytecode-opcode-scan.py --offline 0x<hex...>   # scan string hex langsung

Contoh (RWAKERS 2026-08-18): naive grep 0xff = 232 hit SELFDESTRUCT (SALAH semua, itu
operand PUSH32). Scan push-aware: 0 SELFDESTRUCT/DELEGATECALL/CALLCODE, cuma 1 INVALID
di akhir bytecode (normal terminator).
"""
import sys
import json
import urllib.request

OP_NAMES = {
    0xff: "SELFDESTRUCT",
    0xf4: "DELEGATECALL",
    0xf5: "CALLCODE",
    0x3f: "EXTCODEHASH",
    0xfe: "INVALID",
}


def scan(bc_hex: str):
    """bc_hex: hex string tanpa 0x (runtime bytecode)."""
    if bc_hex.startswith("0x"):
        bc_hex = bc_hex[2:]
    bc = bytes.fromhex(bc_hex)
    found = {}
    push_seen = 0
    i = 0
    while i < len(bc):
        b = bc[i]
        if 0x60 <= b <= 0x7f:  # PUSH1..PUSH32
            push_seen += 1
            i += 1 + (b - 0x5f)  # skip operand
            continue
        if b in OP_NAMES:
            found.setdefault(OP_NAMES[b], []).append(i)
        i += 1
    return bc, push_seen, found


def fetch_code(ca: str, rpc: str) -> str:
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "eth_getCode",
        "params": [ca, "latest"],
    }).encode()
    req = urllib.request.Request(rpc, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())["result"]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    if args[0] == "--file":
        raw = open(args[1]).read().strip()
        bc_hex = raw[2:] if raw.startswith("0x") else raw
    elif args[0] == "--offline":
        bc_hex = args[1][2:] if args[1].startswith("0x") else args[1]
    else:
        ca = args[0]
        rpc = args[1] if len(args) > 1 else "https://robinhood-mainnet.g.alchemy.com/v2/[YOUR_KEY]"
        if "REPLACE" in rpc:
            import os, re
            env = open(os.path.expanduser("~/mint-wallets/.env")).read()
            key = re.search(r"ALCHEMY_KEY_1=(.+)", env).group(1).strip()
            rpc = f"https://robinhood-mainnet.g.alchemy.com/v2/{key}"
        bc_hex = fetch_code(ca, rpc)
        print(f"CA: {ca} | bytecode len: {len(bc_hex)//2} bytes")

    bc, push_seen, found = scan(bc_hex)
    print(f"runtime: {len(bc)} bytes, {push_seen} PUSH instructions")
    if not found:
        print("BERSIH: tidak ada SELFDESTRUCT/DELEGATECALL/CALLCODE/EXTCODEHASH asli")
        return
    for op, pos in found.items():
        print(f"{op}: {len(pos)}x di {pos[:10]}")
    dangerous = [k for k in found if k in ("SELFDESTRUCT", "DELEGATECALL", "CALLCODE")]
    if dangerous:
        print("⚠️ ADA opcode berbahaya:", dangerous)
    else:
        print("hanya EXTCODEHASH (biasanya aman — dipakai royalty/metadata checks)")


if __name__ == "__main__":
    main()
