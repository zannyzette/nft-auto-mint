# Agent #2 VPS Setup — Tencent Cloud (Virginia) + Hermes Fresh Install (2026-08-16)

Resep lengkap setup agent #2 dari nol, berdasarkan sesi live. Konteks: operator
mau agent kedua khusus NFT minting, skill sama (nft-auto-mint), wallet fleet BEDA.

## 1. Pilih Region — VIRGINIA (US-East) untuk Robinhood

Sequencer Robinhood (chainId 4663) ada di Offchain Labs, **Brooklyn NY**.
Chain FIFO by arrival → latensi VPS→sequencer nentuin menang/kalah race.

| Region Tencent Cloud | Latensi ke RH sequencer | Verdict |
|---|---|---|
| **Virginia** | ~30-50ms | 🏆 PILIH INI |
| Silicon Valley | ~70-90ms | OK |
| Frankfurt | ~85-110ms | OK (lebih baik dari SG) |
| Tokyo/Seoul/Jakarta/Bangkok | 150-300ms | ❌ mirip SG |

SG server agent #1 = 300-500ms → sering kalah race. Agent #2 di Virginia = hedge geografis.

## 2. Bundle & Image

- **Bundle: Starter 2vCPU/4GB** (cukup; 2GB mentok kalau race + watchdog + audit barengan)
- **Image: Ubuntu 24.04 + Docker** (dipilih operator; Docker TIDAK dipakai untuk Hermes/tap-tap script — cuma diem aja, tetap bisa install node/python biasa)
- Login: username default `ubuntu` (kalau ditolak coba `root`); password dikirim via email, atau reset di console CVM → instance → Reset Password

## 3. Install Hermes (fresh)

```bash
# update dulu
sudo apt update && sudo apt upgrade -y

# install — BIARIN SELESAI 100%, jangan masuk wizard di tengah
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

**⚠️ PATH FIX (wajib):** setelah install, `hermes` sering "command not found" karena
binary di `~/.hermes/bin/` belum ke-PATH. Fix:
```bash
echo 'export PATH="$HOME/.hermes/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
which hermes   # harus muncul path, bukan "not found"
```
Kalau `ls ~/.hermes/bin/hermes` gak ada → `find / -name hermes -type f 2>/dev/null | grep -v proc`.

## 4. Wizard Setup — pilihan yang bener

1. "How would you like to set up Hermes?" → **Quick Setup (Nous Portal)** — bisa tambah API key sendiri nanti
2. OAuth login: buka link portal.nousresearch.com + masukkan user_code → "Login successful"
3. "Terminal Backend" → **Local** (bukan Docker/Modal/SSH)
4. "Connect a messaging platform?" → **Set up messaging now** → centang **Telegram** (scroll bawah) → paste token bot dari @BotFather
5. Menu model → pakai **"Enter custom model name"** / custom provider (jangan pilih model berbayar dari curated list kalau punya key sendiri)
6. Selesai → "Installation Complete" → `hermes setup model` untuk ganti provider

## 5. API Key — JANGAN lewat chat

Aturan keamanan: API key (orca/OpenRouter/DeepSeek) di-ketik LANGSUNG di terminal
VPS, bukan di-paste ke chat Telegram. Chat tersimpan permanen. Key cuma boleh di:
dashboard provider + config Hermes di VPS. (Operator sempat mau paste key di chat —
tahan, tunjukin cara ketik langsung di wizard.)

## 6. MobaXterm Multi-Server

MobaXterm bisa pegang banyak SSH session sekaligus: New Session → SSH → IP+user+port.
SG (lama) + Virginia (baru) = dua tab beda, gak ganggu satu sama lain.

## 7. Setelah Hermes Jalan — Checklist Agent #2

- [ ] Skill NFT: `tar -xzf nft-skill-pack.tar.gz -C ~/.hermes/skills/` (paket terbaru)
- [ ] Wallet fleet BEDA dari agent #1 (jangan share PK)
- [ ] RPC Alchemy: 2-key rotation (bisa share config)
- [ ] Bot Telegram sendiri (token dari @BotFather)
