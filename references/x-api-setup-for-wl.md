# X (Twitter) API Setup for NFT WL Task Automation (xurl)

WL quests often require follow/RT/quote via X. Automate with `xurl` (official X CLI).
Setup MUST be done by the user (secrets never pasted in chat).

## Install (VPS)
```bash
curl -fsSL https://raw.githubusercontent.com/xdevplatform/xurl/main/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"
xurl --help
```

## X Developer Portal onboarding
1. https://developer.x.com/en/portal/dashboard → create developer account
2. "Describe use cases" field: **≥100 chars**, frame as
   "community engagement + market research" — NEVER "bot spam / auto-follow".
3. Create Project + App.

## User Authentication settings (critical)
| Field | Exact value |
|-------|-------------|
| App permissions | **Read and write** (needed for follow/RT) |
| Type of App | **Web App, Automated App or Bot** (Native App → `unauthorized_client` later) |
| Callback URL | `http://localhost:8080/callback` (http, no trailing slash — else "Invalid URL") |
| Website URL | `https://example.com` |

- Client ID / Client Secret appear in **Keys and tokens ONLY AFTER** user-auth settings are saved.
- Client Secret shown **once** — save immediately.

## Register + auth (user runs via SSH/MobaXterm, not in chat)
```bash
export PATH="$HOME/.local/bin:$PATH"
xurl auth apps add nft-wl --client-id "CLIENT_ID" --client-secret "CLIENT_SECRET"
xurl auth oauth2 --app nft-wl HANDLE     # opens browser OAuth (or link); callback to localhost:8080 "can't connect" = SUCCESS
xurl auth default nft-wl
xurl whoami                              # verify
```

## ⚠️ Headless VPS: plain `oauth2` ALWAYS times out — use `--headless`

On a server with no local browser, `xurl auth oauth2` times out (`Auth Error: Timeout`) because the callback never reaches localhost:8080. The working pattern:

```bash
xurl auth oauth2 --app nft-wl --headless HANDLE
# "No browser needed here — copy a Link out, paste a code back."
```

1. Copy the printed `https://x.com/i/oauth2/authorize?...` URL, open on ANY device (phone/PC), login, **Authorize app**.
2. Browser redirects to `http://localhost:8080/callback?state=XXX&code=YYY` — "This site can't be reached" is NORMAL and expected.
3. **WAIT for the code to fully populate** in the address bar, then copy the ENTIRE URL (`state=` AND `code=` both non-empty) and paste it back into the terminal.
4. Pasting too early (URL still `?state=&code=`) → `TokenExchangeError: "authorization code was invalid"` — just re-run the `--headless` command and retry. Do NOT refresh the callback page (code changes/invalidates).

Verify with `xurl auth status` (app should show `oauth2: <handle>`) then `xurl whoami`.

## Error table
| Error | Fix |
|-------|-----|
| `unauthorized_client` | App type still Native App → switch to Web App, Automated App or Bot |
| `UsernameNotFound` / 403 on /2/users/me | Re-run `xurl auth oauth2 --app nft-wl HANDLE` (pass handle explicitly) |
| Auth OK but requests fail | `xurl auth status` → default app (▸) must be the one with oauth2 tokens |
| 401 everywhere | Token expired/wrong default app |
| `CreditsDepleted` | Add credits in Developer Console → Billing (min $5) |

## Common xurl commands for WL tasks
```bash
xurl follow @project
xurl repost POST_ID
xurl like POST_ID
xurl quote POST_ID "wallet 0x..."
xurl search "from:@project" -n 20
xurl user @project
xurl whoami
```
Never use `--verbose` in agent sessions (leaks auth headers). Never read/paste `~/.xurl`.
