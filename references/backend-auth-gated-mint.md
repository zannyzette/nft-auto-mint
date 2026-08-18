# Backend-Authorization-Gated Mints (worked: LP Brokers, 2026-08)

A mint class where the contract requires a **backend-issued authorization signature** per wallet, plus a **deadline**:
`mint(uint64 deadline, bytes authorization)` / `claim(uint64 deadline, bytes authorization)`.

## Detection
- Site is a SPA; JS bundle contains `mint(uint64 deadline, bytes authorization)` ABI + a `fetch("/api/mint/authorization", POST)` call.
- Site copy: "N free claims", "claim spot", "authorization".
- Example: LP Brokers `0x[YOUR_WALLET_ADDRESS]` (Robinhood) — "10,000 brokers · 2,000 free claims", `claimedCount()` view (1,000/2,000 when probed).

## The flow
```
1. POST /api/mint/authorization {wallet}  → {deadline, authorization (65-byte sig)}
2. Sim mint(deadline, authorization) via eth_call → if OK, broadcast.
```

## Why it usually FAILS from a plain server (the honest blocker)
- The API returns a signature that **only validates for wallets that completed the site's own browser flow** (connect wallet / SIWE / session) or that pass a server-side eligibility check (whitelist, hold-token, X-follow proof).
- From a datacenter IP, the API happily returns a well-formed `authorization` — but `eth_call` of the mint **reverts** with a custom error (e.g. `0x5cf1efac`) because the wallet isn't actually authorized.
- The `deadline` is a hard window end (API may return a stale/fixed deadline; check `Date(deadline*1000)` vs now — if it's already past, the window closed).
- Revert gas tells you where it failed: ~25k = early state check (NotActive/deadline), ~38k = supply/cap, other custom errors = authorization/eligibility.

## SOP
1. GET a fresh authorization, **immediately** sim `mint(deadline, auth)` from the target wallet — if it reverts, the wallet isn't authorized; don't broadcast.
2. Timebox: if the deadline is minutes away and the sim fails, it's a browser-flow/eligibility gate we can't crack from the server — tell the operator plainly (they may claim manually in the browser if the window is still open).
3. Do not hammer the authorization endpoint (rate limits + it's a real user-facing backend).
4. Compare with `apps-script-whitelist-claim.md` (Google Apps Script claim sites) and `opensea-drops-api.md` (OpenSea-managed allowlist) — all three are "backend gates" but with different access mechanics; identify which class before promising execution.
