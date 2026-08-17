# Project Vetting via X Presence (2026-08)

## Why
The operator (zannyzette) judges a mint's worth by the project's X presence BEFORE
committing any wallet/funds. A project with a dead X account is likely a dead mint,
regardless of the site's polish. This is the operator's gate — use it.

## Technique: `api.fxtwitter.com/<handle>` (no API key needed)

```bash
curl -s https://api.fxtwitter.com/<handle>
# → { code:200, user:{ followers, following, verified }, tweets:[...] }
```

Works without auth. Gives followers, verification, and recent tweets (text, likes,
retweets, views, created_at). If `tweets: []`, try `/<handle>/with_replies`.

## Decision table (operator-derived)

| Signal | Example | Verdict |
|--------|---------|---------|
| Followers ≥ ~5k + real tweets | BTC MACHINES @btcordinal (81,108) | Worth — prepare |
| Followers < 100, 0 tweets | GRUNKS @GRUNKSIndex (1 follower, 0 tweets, "verified" individual) | Flag weak — operator decides (skipped) |
| Followers mid-range + active | @fuwacousin (1,491) | Worth — smaller but real |
| No account / dead handle | — | Treat as red flag |

## What to report to the operator (keep it short)

```
@<handle>: <followers> followers · <tweets> tweets · <likes/retweets on recent posts>
→ [worth preparing / weak — up to you / skip]
```

Let the operator say "gas" or "skip". Never auto-mint without that word
(see OPERATOR CONTROL rule in SKILL.md).

## Cross-check FAQ vs operator intel

FAQ numbers can differ from what the operator sees on the page/announcement
(e.g. btcmachine.gg FAQ said "5 per wallet" but the operator stated 20/wallet for
the public phase). Report both, trust the operator's screen for the phase they
target, verify on-chain once the phase opens (getMintStats / mint fn params).

## Other vetting quick-checks (site blocked or thin)

- `docs.<domain>` often open when app is Vercel-blocked (Scatter worked)
- GitHub `<project>-contracts` repo → chain/factory/mint mechanics
- DuckDuckGo HTML search without API keys
- `api.fxtwitter.com/<artist/founder handle>` → follow count signals legitimacy
