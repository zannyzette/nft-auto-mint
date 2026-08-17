# External-LLM Skill Review — workflow & filtering (2026-08-16)

Operator got a 1-month Tencent Cloud ADP trial and used a second LLM (GLM-5,
Kimi K2-5) to review the nft-auto-mint skill. Result: 3 real improvements
applied, but ~⅓ of findings were misconceptions. This is the playbook.

## When to do it
- Occasionally (after a big project / when skill feels stale), NOT daily —
  diminishing returns; the skill is proven by 20+ live projects.
- Use a model that is ACTUALLY different (GLM-5, Kimi K2-5). DeepSeek Flash
  V-4 = the same model the agent already runs on → review will mirror itself,
  zero new perspective. Don't waste the trial on it.

## Redaction BEFORE sharing (critical)
Never paste raw SKILL.md/references — they contain API keys & addresses.
Generate a redacted copy:
- `re.sub(r'alch_[A-Za-z0-9]+', 'alch_[REDACTED]', s)`
- `re.sub(r'0x[0-9a-fA-F]{40}', '0x[REDACTED]', s)`
- `re.sub(r'OPENSEA_API_KEY=\S+', 'OPENSEA_API_KEY=***', s)`
- grep-verify no `PRIVATE_KEY=`, no `alch_`, no `0x{40}` remains.
- Prepend a REVIEW REQUEST header (what to look for: contradictions,
  missing pitfalls, faster/cheaper execution, security risks; answer in
  Indonesian, list format) so the model knows the task.

## Filtering the findings (MANDATORY — don't apply blindly)
Reviewed 21 findings from GLM-class review: 3 valid → applied, 9 already
covered, 5 wrong about Robinhood mechanics, 4 minor. Known false-positives
to reject without debate:
- **"Adaptive gas ceiling saves money"** — WRONG on Robinhood: unused
  EIP-1559 ceiling is REFUNDED, lowering it saves nothing.
- **"Add multi-RPC fallback"** — already have 2 Alchemy keys + 30s 429
  cooldown auto-rotation; canonical/drpc removed by operator mandate.
- **"Nonce collision between wallets"** — impossible: each wallet has its
  own independent nonce; the real risk is per-wallet desync.
- **"Seed phrase exposure risk"** — already covered: setup scripts strictly
  validate `0x + 64 hex`; a seed phrase fails the regex and is rejected.
- **"Local mempool monitoring"** — Robinhood has no public mempool like
  Ethereum mainnet; not applicable.

## Genuinely useful categories that DID apply
- Proxy/upgradeable/self-destruct contract check → added to Scam Detection.
- Explicit definition of "project selesai" for revoke timing.
- Multicall batching for repeated polling reads.

## Verdict pattern
External review = worth it as a SECOND OPINION, but the agent must filter
every finding against Robinhood chain reality + the skill's existing
architecture. A "security score" from a generic audit is unreliable — trust
live-project evidence over static review scores. Tell the operator which
findings were applied, which rejected, and why (they appreciate honesty).
