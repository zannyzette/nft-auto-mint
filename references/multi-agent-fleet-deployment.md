# Multi-Agent Fleet Deployment — second Hermes agent for NFT minting (2026-08-16 VERIFIED)

Second Hermes instance on a separate VPS (US-East preferred, Europe acceptable)
with its OWN bot + OWN wallet fleet. Latency hedge: one agent fires, one backs up.

## Verified install path (Tencent Cloud VPS, Ubuntu 24.04+Docker image)
1. Order VPS (Tencent ADP trial worked; Contabo rejected Jago Visa — payment
   gateway dependent). Region: **Virginia (US-East)** best for Robinhood sequencer
   (Brooklyn NY, ~30-50ms); Europe Frankfurt ~85-110ms still 4x better than SG.
   Image: plain Ubuntu 24.04 LTS (Hermes prebuilt images = unknown config, avoid
   for wallet-holding agents). 4GB RAM recommended ($2-3/mo more than 2GB).
2. MobaXterm: Session → SSH → IP + username `ubuntu` (Tencent default; password
   emailed — if missing, reset password in CVM console).
3. Install Hermes:
   ```bash
   sudo apt update && sudo apt upgrade -y   # wait for FULL completion
   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
   ```
   ⚠️ Do NOT jump into the wizard mid-install. Binary lands at
   `~/.hermes/hermes-agent/venv/bin/hermes` — NOT on PATH yet:
   ```bash
   echo 'export PATH="$HOME/.hermes/hermes-agent/venv/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   which hermes   # must resolve
   ```

## Model provider setup (key-owning user)
- `hermes setup model` wizard → pick the provider matching your key.
  For custom routers (orca etc.): **Custom Direct API** → **auto-detect**
  compatibility → base URL + key + model. For OpenRouter: pick OpenRouter,
  model `deepseek/deepseek-chat`.
- If wizard says "No inference provider configured" despite config set, walk the
  wizard (it writes the config shape Hermes expects — `hermes config set` alone
  can leave `model.name` unset because the key is `model.default`).

## ⚠️ Switching provider when a free API dies (orca → OpenRouter, 2026-08-16)
- **Free/custom router keys (e.g. `sk-orca-...` from a free-tier aggregator) die
  without warning** — model stops replying. Don't debug the dead key; switch
  provider. OpenRouter is the durable choice (one key, many models, pay-per-use).
- Cleanest switch: `hermes auth` → **Add a credential → openrouter** → paste key
  → wizard stores it (credential pool shows `env:OPENROUTER_API_KEY`). Then:
  ```bash
  hermes config set model.provider openrouter
  hermes config set model.default <model>
  systemctl --user restart hermes-gateway
  ```
- **OpenRouter free model list changes constantly** — Qwen `:free` models were
  REMOVED; never hardcode a free model name. List current free models:
  `curl -s https://openrouter.ai/api/v1/models | grep -o '"[a-z0-9._/-]*:free"'`
  Good free picks (2026-08-16): `z-ai/glm-5.2:free` (top), nemotron-3-super,
  gemma-4-31b. Free models rate-limit under load — if flaky use
  `deepseek/deepseek-chat` (pay-per-use, cheap).
- Don't hand the operator a `nano ~/.hermes/.env` edit session — the auth/model
  wizards handle key storage; operator just pastes the key into the wizard.
- Quick manual config for OpenAI-compatible endpoints:
  ```bash
  hermes config set model.provider openai
  hermes config set model.base_url <base>
  hermes config set model.default <model>   # NOT model.name
  ```
  Key goes in `~/.hermes/.env` as `OPENAI_API_KEY=<key>` (type it directly,
  never paste keys in chat). Verify models available:
  `curl -s <base>/models -H "Authorization: Bearer <key>"`.
- Verify: `hermes doctor` → "API key or custom endpoint configured" ✓;
  `hermes` → Start chatting → "halo" replies.

## Telegram gateway (verified)
- `hermes setup gateway` → platform list → **press SPACE to check Telegram**
  (plain Enter = none selected), then Enter.
- Allowed user IDs: operator's Telegram ID (e.g. 5326334110) → allowlist set.
- Home channel = same user ID → Y.
- Restart gateway: `systemctl --user restart hermes-gateway`.
- **`Any cannot be instantiated` in gateway.log** = python-telegram-bot dep
  missing/broken → `hermes doctor --fix` installs it, then restart. Check
  `tail ~/.hermes/logs/gateway.log` for "Connected to telegram".

## Persona + skill propagation (make agent #2 behave like agent #1)
- Pack skill: `tar -czf nft-skill-pack.tar.gz -C ~/.hermes/skills nft/nft-auto-mint`.
- Persona: operator wants agent #2 to reply in the same informal Indonesian,
  table+$, WIB, honest style. Write an `AGENT2-PERSONA.md` with:
  - communication style rules (informal ID, tables, $ amounts, WIB, honesty,
    admit errors),
  - operator context (standing approval, manual NFT selling, "free must be free"),
  - key facts agent #1 knows (Robinhood chain 4663 = Arbitrum Orbit, home turf),
  - **PROTOCOL: read the skill file before answering NFT questions** — without
    this, a fresh agent answers from general knowledge and gets Robinhood chain
    WRONG (said "Robinhood has no chain" — must be corrected explicitly).
- Copy: `cp AGENT2-PERSONA.md ~/.hermes/SOUL.md`, extract skill pack to
  `~/.hermes/skills/`, restart gateway.
- Transfer pack between VPS: scp from SG to VA (accept SSH fingerprint, use SG
  password), or MobaXterm SFTP download/upload.
- Verify skill loaded: `hermes skills list` → nft-auto-mint local/enabled.

## Wallet fleet for agent #2
- MUST be separate wallets (16-20+) — never share PKs between agents (nonce &
  NFT collision). Operator pastes Rabby PKs via `setup-wallets-interactive.sh`.
- RPC: share Alchemy 2-key config or create new app.

## Notes
- `hermes doctor` warnings (npm vulns, TERMINAL_CWD deprecated, missing optional
  tools) are harmless for minting — ignore.
- Tencent ADP free trial: useful for LLM review of skills (GLM-5/Kimi give fresh
  perspective; DeepSeek Flash = same model as agent, no added value). Filter
  external AI review — not all suggestions fit Robinhood reality.
