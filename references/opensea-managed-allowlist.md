# OpenSea-Managed Allowlist — "Partner Collection Access" (GreedCats, 2026-08)

Some SeaDrop collections show an allowlist stage in the OpenSea UI ("Partner Collection Access Allowlist") where eligibility is **managed by OpenSea's backend**, NOT on-chain. Verified live (GreedCats v2 mint, Aug 2026): operator checked the UI and all 10 wallets showed "eligible — 2 free mints", yet the on-chain SeaDrop config had **NO signed stage and NO token-gated stage**.

## Why the mismatch

| Check | Result (worked example) |
|-------|--------------------------|
| `getPublicDrop(nft)` | Only a new PUBLIC stage (price changed to 0.0002, new startTime) |
| Decode owner `multiConfigure` tx | `signedMintValidationParams` = zero signer / empty |
| `getSignedMintValidationParams(nft, signer)` for candidate signers | All-zero return (empty) |
| `getTokenGatedDrop(nft, heldCollection)` for EVERY collection the fleet holds (14 tested) | All empty |
| OpenSea UI | "Allowlist — Free — 2/wallet — eligible" |

Conclusion: OpenSea's server decides eligibility from its own records (we hold GreedCats + partner collections) and **issues the mintSigned signature at mint time** — the signature comes from OpenSea's backend, so the mint cannot be called directly from a script without either (a) the OpenSea UI, or (b) the reverse-engineered gql.opensea.io SIWE flow (see `opensea-fcfs-blueprint.md`, not yet built as code).

## Diagnostic recipe (before promising execution)

1. `getPublicDrop(nft)` — note if the public stage CHANGED (price/start) vs earlier; an "update" usually means the owner re-`multiConfigure`d.
2. Decode the latest owner `multiConfigure` tx (Blockscout `decoded_input.parameters[0].value`) — check `signedMintValidationParams` (zero = no on-chain WL) and publicDrop tuple.
3. Probe `getTokenGatedDrop(nft, X)` for each held collection — any non-empty = direct-callable via `mintAllowedTokenHolder` (that IS bot-able; partner-collection holder stage).
4. If ALL empty but the operator says the UI shows eligibility → **OpenSea-managed** → paths: manual UI per wallet, or gql.opensea.io automation. Say so plainly; do NOT promise a direct contract call.
5. Bonus diagnostic: an owner `mintSigned` tx (Blockscout) decodes to `[nftContract, feeRecipient, minterIfNotPayer, quantity, mintParams(minPrice,maxPrice,start,end,perWallet,stage,feeBps,restrict), salt, signature]` — confirms the allowlist mechanism exists even when current params are empty.

## Related intel (same session)

- **dRPC paid tier (drpc.org)**: Free = public/shared nodes, 100 req/s, ~210M CU/mo. **Growth = $6 per 1M requests, high-performance (dedicated) nodes, 5,000 req/s, pay-as-you-go (no monthly sub)** — the dedicated nodes survive the T-0 flood that chokes free public nodes (BrokeCatss failure mode: all 3 free RPCs hung when every bot broadcast at once). A friend's paid dRPC endpoint showed 3ms latency — the 3ms is mostly geography (US server), but the paid tier's flood-survival is the real value. Get a paid endpoint: drpc.org → Connect → Create Endpoint → Robinhood → upgrade to Growth.
- **Fan-made token-burn variant (Cash Delivery Birds)**: mint = `approve(existingERC20 → NFT)` then `NFT.mint(qty)` (10,000 $CASHBIRD/bird), NO built-in exchange (site's token link just points to X), and the FAQ itself says "not affiliated with the token team". Blocker discovered: wallet had 0 of the payment token and no obvious buy path (Blockscout down + 1inch API dead that session). Before promising a token-burn mint, CONFIRM where the operator gets the payment token, and flag "not affiliated"/fan-made disclaimers from the FAQ.
