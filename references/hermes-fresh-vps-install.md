# Hermes Fresh-VPS Install Walkthrough (Agent #2, 2026-08-16)

Setup Hermes agent baru dari nol di VPS (Tencent Cloud Virginia, Ubuntu 24.04+Docker image),
dipandu lewat MobaXterm. Semua gotcha di bawah ketemu live.

## Flow ringkas
1. VPS: region US-East/Virginia terbaik utk Robinhood (sequencer di Brooklyn NY); Europe ok; 4GB RAM disarankan.
2. MobaXterm → Session → SSH → IP + user (`ubuntu` atau `root`) + password (dari email atau reset di console).
3. `sudo apt update && sudo apt upgrade -y` — BIARIN selesai (mirror tencent lama keliatan "stuck", itu normal download).
4. `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash` — biarin COMPLETE total, JANGAN masuk wizard di tengah.
5. Wizard: **Quick Setup (Nous Portal)** → OAuth link+code → Terminal Backend: **Local** → messaging: **Telegram** (scroll, SPACE centang, ENTER).
6. Setup model custom → config di bawah.

## GOTCHA 1 — `hermes: command not found` setelah install
Binary gak ke-PATH. Lokasi: `~/.hermes/hermes-agent/venv/bin/hermes`.
```bash
echo 'export PATH="$HOME/.hermes/hermes-agent/venv/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
which hermes   # harus muncul path
```
Cari kalau beda: `find ~/.hermes -name "hermes*" -type f | grep venv/bin`.

## GOTCHA 2 — config key model: `model.default`, BUKAN `model.name`
`hermes config set model.name deepseek-chat` → diam-diam gak keset ("Config key not set").
Yg bener:
```bash
hermes config set model.provider openai          # atau openai-compatible
hermes config set model.base_url https://api.orcarouter.ai/v1
hermes config set model.default deepseek-chat     # ← default, bukan name!
```
Verifikasi: `hermes config get model.provider|model.base_url|model.default`.

## GOTCHA 3 — router custom OpenAI-compatible (orca: key prefix `sk-orca-`)
- Bukan OpenRouter standar (`sk-or-`). Pilih provider `openai` / `openai-compatible`.
- Base URL dari dashboard router (contoh `https://api.orcarouter.ai/v1`).
- API key masuk `~/.hermes/.env` sebagai `OPENAI_API_KEY=...` — KETIK LANGSUNG di VPS, jangan lewat chat.
- Nama model: coba `deepseek-chat` → 404? → `deepseek/deepseek-chat` → 404? → cek daftar model di dashboard router.
- Error "Model 'DeepSeek' not found ... endpoint inference-api.nousresearch.com" = provider masih `nous`/base_url lama — set ulang ketiganya.

## GOTCHA 4 — layar "Installation Complete!" itu info, bukan menu
Tekan q/ESC → prompt → `hermes setup model` / `hermes setup gateway` dari prompt.
`hermes doctor` buat verifikasi: semua ✓ = sehat; warning npm vuln + tool keys optional = abaikan.

## GOTCHA 5 — Firewall (Contabo)
Fitur firewall gratis Contabo: kalau dipaksa bikin, set rule Allow-All dulu (inbound 22 + outbound all) atau lo ngunci diri dari SSH. Abaikan halaman firewall kalau opsional.

## Keamanan
- API key / PK TIDAK pernah lewat chat Telegram (log permanen). Paste langsung di terminal.
- Agent #2 wajib wallet fleet BEDA dari agent #1 (jangan share PK).
- Setup gateway Telegram: `hermes setup gateway` → pilih Telegram → token dari @BotFather.
