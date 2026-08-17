# Game-Gated Mint (play-to-mint, HTML5 game) — worked: SPAWNHOOD 2026-08-15

Mint class where the NFT is earned by PLAYING a browser game, not by clicking mint.
Worked example: spawnhood.com (Robinhood 4663, "Genesis" 10,000). Art on Bitcoin
ordinals, token on Robinhood chain.

## Signature (recognize fast — this is NOT automatable)
- Site text: "chase enemies, land 3 hits within 10 seconds to force a claim, then
  mint within 2 minutes", "Arrow keys / WASD to move · Enter/double-tap to swirl".
- `game.js` (large, canvas/input handling) + `audio.js` — NOT a Next.js mint page.
- Mint ABI: `mint((address to,uint256 tokenId,uint256 nonce,uint256 deadline) v, bytes sig) payable`
  — server-issued voucher, same family as commitment-API but the voucher only appears
  AFTER winning the game (server verifies real-time play).
- Owner console: "Deploy Contract & Go Live" — contract may not even be deployed yet
  (owner address = EOA). Check `getCode(ownerAddr)` before promising anything.

## Verdict pattern
- **Game-gated = manual only.** The agent cannot move a canvas avatar / land hits in
  real time, and the server only issues the mint voucher post-win. Do NOT burn time
  trying to script the game or find a claim bypass — there is none by design.
- What IS automatable after a win: nothing needed — the site signs + submits itself.
  Operator plays in browser (connect Rabby → play → claim → mint).
- Early-supply note for the operator: "GENESIS X / 10,000 claimed" — if X is tiny,
  minting now = early/rare, worth the manual effort; but verify contract is LIVE
  first (the counter can include testnet/dry-run mints before the owner flips live).
- Other game-gated variants to expect: quiz-gated, boss-fight-gated, leaderboard-gated
  — same rule: manual unless the site exposes a non-game API path.

## Recon notes (cheap checks that answer "can we automate?")
1. `curl` site → look for game.js / canvas / keyboard controls → game-gated.
2. `grep 'api/' game.js` → `api/stats`, `api/deploy/config`, `api/deploy/confirm` —
   stats shows `genesisMinted` + rarity counts; deploy endpoints are owner-only.
3. `getCode(ownerAddr)` on-chain: EOA = not live yet; contract = live.
4. Mint ABI check via game.js string search: `function mint((address to,...` =
   voucher-signed → server-controlled regardless of game.
