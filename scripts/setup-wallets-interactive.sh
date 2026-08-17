#!/usr/bin/env bash
# Setup wallet baru dengan paste PK dari Rabby/MetaMask (hidden input)
# PK TIDAK tampil di layar & TIDAK lewat chat — aman.
# Mode yang operator PREFER (2026-08-15): wallet dibuat di Rabby operator dulu,
# PK di-paste satu per satu, biar bisa dipantau di OpenSea (linked wallet).
# Usage: bash setup-wallets-interactive.sh <start> <jumlah>
# Contoh: bash setup-wallets-interactive.sh 11 5
set -e
BASE="${WM_BASE:-/home/ubuntu/mint-wallets}"
START="${1:-11}"
COUNT="${2:-5}"

for i in $(seq "$START" $((START + COUNT - 1))); do
  DIR="$BASE/wallet-$i"
  ENV_FILE="$DIR/.env"
  mkdir -p "$DIR"
  if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
    echo "⚠️  wallet-$i sudah punya .env (dari command sebelumnya)."
    read -r -p "  Mau GANTI dengan PK Rabby lo? (y/N): " ANS
    if [ "$ANS" != "y" ] && [ "$ANS" != "Y" ]; then
      echo "  Skip wallet-$i."
      continue
    fi
  fi
  echo ""
  echo "=== Wallet $i ==="
  read -s -p "  Paste private key dari Rabby (tidak akan tampil): " PK
  echo ""
  if ! [[ "$PK" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    echo "❌ Format PK salah (harus 0x + 64 hex). Ulangi wallet $i."
    i=$((i-1))
    continue
  fi
  ADDR=$(NODE_PATH=/tmp/neon-sign/node_modules node -e 'const{ethers}=require("ethers");console.log(new ethers.Wallet(process.argv[1]).address)' "$PK")
  umask 177
  echo "PRIVATE_KEY=$PK" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "✅ wallet-$i siap → $ADDR"
done

echo ""
echo "=========================================="
echo "Semua selesai! Sekarang sync wallets.json:"
echo "=========================================="
echo "  NODE_PATH=/tmp/neon-sign/node_modules node $BASE/sync-wallets-json.js"
