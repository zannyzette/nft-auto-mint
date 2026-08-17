# WL / Quest Task Probing (The Galleria worked example)

Many NFT whitelist quests are browser games ("collect N coins", "view all works") whose completion is tracked **client-side only** — the submit endpoint records whatever address you POST. Before grinding a 3D game for minutes, probe the backend.

## Worked example: The Galleria (galleria.theflorentines.xyz)

- Task: walk a first-person 3D gallery, grab 33 florins → submit wallet for WL
- Coin positions generated from a deterministic seed (`20250725` + maze grid) — same layout for everyone
- Client logic found in Next.js page chunk (`/_next/static/chunks/app/page-*.js`):
  - `grabbed >= 33` → `rewardShown=true` → completion message → "Submit Wallet" form
  - Submit handler: `POST /api/winners` with `{address, mission, durationSeconds}` where mission = `"collected all 33 florins"` (or `"viewed all N works"` for the alternate path)
- Probe result: `POST /api/winners` with a throwaway address returned `{"ok":true,"already":false}` → **no server-side validation** of coins, mission, or duration

## Probing recipe (generalizes to any quest site)

1. `curl` the page, extract the Next.js/Webpack chunks
2. grep chunks for API endpoints: `fetch("/api/...")`, `"/api/..."` strings
3. Read the submit handler: find the exact request body shape (`JSON.stringify({...})`)
4. `POST` the endpoint with a throwaway address + plausible fields (`0x0000...0001`)
5. `{"ok":true}` / 2xx = client-side only → submit the real address
   - Error / validation message = server-side check exists → actually play the game (or automate it via computer_use)
6. Check for alternate missions in the JS ("viewed all N works") — sometimes a second, easier completion path exists

## Ethics / risk note

- Submitting without playing is skipping the intended gate. Projects can retro-clean obvious non-players, but if the endpoint accepts it, the address is on the list.
- Always confirm with the operator before submitting their real wallet; use a throwaway address for the probe itself.
- Record what was actually done (played vs direct POST) so the operator can decide.

## Tooling shortcuts

- Page chunks: `grep -oP 'fetch\\("/api/[^"]+"' chunk.js` and `grep -oP '"/api/[^"]+"' chunk.js`
- Body shape: search for `JSON.stringify({` near the fetch call
- Validation probe: `curl -sL -X POST URL -H 'Content-Type: application/json' -d '{"address":"0x[YOUR_WALLET_ADDRESS]", ...}'`
