#!/usr/bin/env bash
# Secure per-wallet PK onboarding — operator runs this on the VPS, PK never passes chat.
# Usage: bash setup-wallet.sh <nomor_wallet>
# Pattern: hidden input (read -s), strict format validation, umask 177 + chmod 600.
set -e
WALLET_NUM=$1
if [ -z "$WALLET_NUM" ]; then
  echo "Usage: bash setup-wallet.sh <nomor_wallet>"
  exit 1
fi

DIR="/home/ubuntu/mint-wallets/wallet-$WALLET_NUM"
ENV_FILE="$DIR/.env"

if [ ! -d "$DIR" ]; then
  echo "❌ Folder wallet-$WALLET_NUM tidak ada"
  exit 1
fi

if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
  echo "⚠️  .env wallet-$WALLET_NUM sudah ada isinya. Skip."
  echo "   Kalau mau ganti, hapus dulu: rm $ENV_FILE"
  exit 0
fi

echo "=========================================="
echo "  SETUP WALLET $WALLET_NUM"
echo "=========================================="
echo ""
echo "1. Buka Rabby/MetaMask di PC lo"
echo "2. Export private key wallet $WALLET_NUM:"
echo "   → Settings → Account → Show private key"
echo "   (PK format: 0x + 64 karakter hex)"
echo ""
echo "3. Paste PK lo di bawah (TIDAK akan tampil):"
echo ""

# Baca PK tanpa echo (hidden input)
read -s -p "Private key: " PK
echo ""

if ! [[ "$PK" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "❌ Format PK salah — harus 0x + 64 hex chars"
  exit 1
fi

# Simpan ke .env dengan permission aman
umask 177
echo "PRIVATE_KEY=$PK" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo ""
echo "✅ PK wallet-$WALLET_NUM tersimpan (chmod 600)"
echo ""
echo "👉 Update wallets.json: tambah address + status active"
echo "   (atau kasih tau agent — dia yang update)"
