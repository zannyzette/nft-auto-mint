# Wallet NFT Holdings Investigation — "NFT ada di Etherscan tapi gak muncul di OpenSea" (worked: EthOS Meow Meows, 2026-08)

Operator sees an NFT in a wallet's Etherscan/Etherscan-history but OpenSea's wallet view doesn't show it. Almost always the NFT IS on-chain and OpenSea's **spam filter** hid it. Reusable diagnostic:

## Steps
1. **Confirm on-chain ownership** — Blockscout (same API shape on every chain):
   - Mainnet: `GET https://eth.blockscout.com/api/v2/addresses/{wallet}/nft`
   - Robinhood: `GET https://robinhoodchain.blockscout.com/api/v2/addresses/{wallet}/nft`
   - Response `items[]` gives `token.address`, `token.name`, `id` (token ID), `amount`. This lists ALL NFTs incl. spam — reliable even when the contract ABI is unverifiable.
2. **Identify the contract** (if needed): probe `name()/symbol()/decimals()` via RPC — ERC-20 vs ERC-721. Unverified/spam contracts may revert on BOTH standard views; don't conclude "not a token" from that — Blockscout's /nft endpoint is the source of truth for holdings.
3. **Check OpenSea indexing** — `https://r.jina.ai/https://opensea.io/assets/{chain}/{contract}/{tokenId}` (jina bypasses Cloudflare). If the page loads with a collection title + floor price, the collection IS indexed — the item just isn't shown in the wallet view.
4. **Root cause** — OpenSea auto-hides NFTs from UNVERIFIED collections into the profile's **Hidden** tab, especially when the wallet received airdrop spam (several unverified collections = spam signal). The NFT is safe, just hidden.
5. **Fix for the operator** — OpenSea profile → **Hidden** tab → find the NFT → **Unhide**. Or open the direct item URL (works because the collection is indexed).

## Bonus
- The jina item page also reveals **floor / last-sale** for value assessment (e.g. EthOS Meow Meows floor 0.0147 ETH ≈ $28 while the wallet view showed nothing).
- Working mainnet ETH RPCs from the SG VPS (2026-08): `https://ethereum-rpc.publicnode.com`, `https://eth.drpc.org`, `https://rpc.ankr.com/eth`, `https://1rpc.io/eth`, `https://eth-mainnet.public.blastapi.io` — `eth.llamarpc.com` and `cloudflare-eth.com` failed network detection from this VPS.
- On-chain confirm = authoritative. Never tell the operator "NFT hilang" — it's a visibility problem, not an ownership problem.
