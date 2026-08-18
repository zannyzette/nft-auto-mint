# Commitment-API Mint (backend-issued seed commitment + signature)

Mint class where the NFT contract requires `publicMint(bytes32 seedCommitment, uint64 commitmentExpiry, bytes operatorSignature)` and the project backend issues the commitment+signature via a public POST endpoint. Worked example: **Legend of the Stonks** (legendofthestonks.xyz, Robinhood chain, 2026-08-15).

## Flow
1. Recon: the site's page chunk exposes the ABI + contract address. Contract address often NOT in HTML — parse the RSC payload (`self.__next_f.push(...)` in the HTML) for the address near `"paused":false`, or find it via the feed's block and scan that block's txs.
2. `POST /api/commitment/mint {address}` → `{commitment, expiry, signature}` (initially NO auth — fully automatable).
3. Read `currentPriceFor(wallet)` → price (0 = free).
4. `staticCall publicMint(commitment, expiry, signature, {value: price})` → if it passes, sim is good.
5. Sign + broadcast `publicMint(commitment, BigInt(expiry), signature)` with value = price.
6. Reveal step may follow (POST `/api/operator/reveal {tokenId}`) — wait for `LegendEntered` event from the receipt.

## Pitfalls (all hit live)
- **staticCall PASSES but broadcast REVERTS with gasUsed ≈ gasLimit → OUT OF GAS.** Sim doesn't enforce the gas limit; a complex mint can need >300k. gasUsed 299,123/300,000 = classic OOG. Fix: gasLimit 1,000,000 (Robinhood refunds unused). Decode: if `rc.gasUsed` ≈ limit and no revertData, it's OOG.
- **ethers v6 `broadcastTransaction` returns a TransactionResponse OBJECT** — `h.hash`, not `h`. Passing the object to `getTransactionReceipt` fails silently ("[object Object]" in logs) and every tx looks "pending".
- **Commitment API can flip to gate-only mid-window**: when the mint gets hot, the backend may return `{"error":"commitments are issued to the Kingdom's own gate"}` or `seed store unavailable: upstash 400` / `RPC Request failed` (their Alchemy key 429'd). At that point the mint is browser-only — report and move on, do NOT grind.
- **Backend state can reset**: `/api/world` showed `minted:0, syncedBlock:0` after their backend restart, while on-chain still had supply. Trust on-chain, not their API.
- **Supply narrative changes**: "FREE ENDS at 444 Legends" became "2,444 persistent onchain Legends" in meta description — re-read the page, don't cache.
- **Free-lane views can error on some RPCs** (`mintedBy` ERR) — use the canonical RPC or retry; a fresh commitment per attempt; one-time-use commitments (reuse → revert).

## Verdict pattern
Public commitment API + no auth = automatable. Once gated/browser-only → skip (same family as LP Brokers `backend-auth-gated-mint.md`). Distinguish: LP Brokers needed a browser-bound signature from the start; LOTS was open then gated — the gating flip is the tell.
