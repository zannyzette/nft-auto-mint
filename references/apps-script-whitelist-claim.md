# Google Apps Script Whitelist Claim (worked: THE BUFOS, 2026-08-12)

A recurring mint class: single-file HTML site (often AI/Gemini-generated) with a **Google Apps Script backend** (Google Sheets = the whitelist). Flow: enter invite code → paste wallet → "claim spot" (FCFS). No on-chain mint — the claim just reserves a row in a Sheet.

## Anatomy (from thebufos.com)

- One inline `<script>` with `const ENDPOINT = "https://script.google.com/macros/s/AKfycbw.../exec"`.
- `DEMO = !ENDPOINT` — empty endpoint = test mode where `BUFO-TEST1` always works. **If ENDPOINT is set, test codes DO NOT work.**
- Two POSTs to the same endpoint (`Content-Type: text/plain;charset=utf-8`, body JSON, `redirect: "follow"`):
  - `{action:"check", code}` → `{ok:true, remaining:N}` or `{ok:false, reason:"invalid"|"full"|"sold_out"}`
  - `{action:"claim", code, wallet}` → `{ok:true, number, codename, remaining}` or `{ok:false, reason:"duplicate"|"full"|"sold_out"|"bad_wallet"}`
- Ticket fields: `number` (boarding pass No.), `codename` (generated alias).

## ⚠️ Google Apps Script quota — the #1 failure mode

Under claim bursts the endpoint returns an HTML error page (HTTP 200!) instead of JSON:

```
"There are too many executions running simultaneously for this Apps Script project at this time."
"There are too many scripts running simultaneously for this Google user account."  ← per-account limit, worse
```

The site's `fetch → res.json()` then throws → user sees "Couldn't reach the list. Check your connection and try again." — **not a code bug, a free-tier quota wall** (~30 concurrent executions per consumer account). Manual browser success = luck hitting a quiet gap between bursts.

## How to claim despite the quota — retry bot

1. **Use node fetch, NOT curl**: Apps Script macro URLs 302-redirect; browser `fetch(..., {redirect:"follow"})` preserves POST. `curl -L` converts POST→GET on 302 by default → script receives `doGet` (often undeclared) → different error page. Fix for curl: `--post301 --post302`; simpler: replicate the site with node fetch.
2. Poll `{action:"check", code}` every 4-5s until a JSON response arrives (quota is transient; quiet seconds open up). Parse: throttle HTML → keep polling; `ok:true` → proceed to claim; `{ok:false, reason:"full"}` → **code exhausted, stop and get a new code** (do NOT keep hammering a full code).
3. Then claim with the operator's wallet, same retry-while-throttled pattern. `reason:"duplicate"` = already claimed → treat as success.
4. Log every 5th attempt, cap attempts (~200 ≈ 15-20 min), auto-stop on decisive answers.

## Reusable script
`/home/ubuntu/mint-wallets/bufos-claim-v2.js` — node-fetch retry bot (check → claim, wallet as arg). Copy + change ENDPOINT/CODE/WALLET per project.

## Pitfalls
- Don't hammer faster than ~4s — Google may block the script project entirely (abuse signal).
- Test-mode codes (`BUFO-TEST1`) only work when ENDPOINT is empty; a live site ignores them against the real Sheet.
- Claim is FCFS and permanent per wallet — once `ok:true`, the spot is reserved; verify the ticket (number/codename) and report it.
- These sites sometimes hardcode the test code in the backend too — worth one try with the demo code before asking the operator for a real one.
