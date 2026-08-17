# Gameplay-Gated Mint (play-to-mint arcade) — worked: SpawnHood, 2026-08-15

Mint class: NFT minted by WINNING an in-browser arcade game, then the server
issues a signed voucher to mint. Anti-bot by design — the human must play.

## Worked example: SPAWNHOOD (spawnhood.com)
- "Art on Bitcoin (recursive ordinal inscription), token on Robinhood Chain (4663)".
- Game: WASD/arrows move, Enter/double-tap = sword swirl. Chase a random enemy
  from a spawning pool, land 3 hits within 10s, then mint within 2:00 before it
  escapes. 10,000 Genesis, rarity tiers (diamond 2k / gold 1k / green 4k / ruby 3k).
- Mint function (from game.js): `mint((address to, uint256 tokenId, uint256 nonce,
  uint256 deadline) v, bytes sig) payable` — voucher signed by SERVER, issued only
  after a win. Price comes from the voucher (`m.price`), free = 0.
- Endpoints: `api/stats` (genesisMinted, byRarity, counts per pool), `api/deploy/config`
  (full ABI + owner + tierPrice), `api/deploy/confirm` (POST txHash after owner deploy).
- Owner console in page: "Deploy Contract & Go Live" — contract may not be deployed
  yet. `OWNER_ADDR` in game.js = deployer/owner EOA; check `getCode()` — if empty,
  mint is NOT live regardless of site claims.

## Detection signature (recognize in <2 min)
- Page is a canvas game, not a mint button ("play to mint", "land 3 hits", WASD controls).
- `game.js` contains a `mint((address,uint256,uint256,uint256) v, bytes sig)` ABI —
  tuple voucher + signature = server-signed, NOT directly callable without winning.
- `api/stats` shows tiny minted count + per-pool counts (early / not live).

## Verdict / playbook position
- **NOT agent-automatable** (keyboard + canvas real-time input required; voucher only
  after human win). Classify as manual-play: tell the operator to play in browser, or
  check for a backend bypass endpoint (api/deploy/*, api/mint?) before promising.
- If contract undeployed (`getCode` empty) → same as demo/not-live detection
  (`references/demo-not-live-detection.md`): report "not live yet", don't grind.
- DO NOT promise "bisa otomasi" — this class needs a human at the keyboard.
