# SeaDrop Public Stage — mintPublic Recon & Mint (GRUNKS worked example, 2026-08)

## TL;DR
SeaDrop collections have TWO mint classes. The **public stage is `mintPublic()`** on the SeaDrop
contract — payable, NO salt/signature, calldata pre-buildable, bot-friendly from any VPS.
Only allowlist/private stages (`mintSigned`/`mintAllowList`) need OpenSea backend signatures.
Do NOT assume "SeaDrop = needs reverse-engineered gql.opensea.io bot" — check the drop stages first.

## GRUNKS example (Robinhood chain, ERC721SeaDropCloneable)

- NFT contract: `0x[YOUR_WALLET_ADDRESS]`
- Impl: `0x[YOUR_WALLET_ADDRESS]` (ERC721SeaDropCloneable, verified, 49 fns)
- SeaDrop contract: `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5` (verified standalone `SeaDrop`)
- Public drop: price `53000000000000` wei (0.000053 ETH ≈ $0.10), start 1786503919 (10:05 WIB),
  end 1786763119 (~3 days), maxPerWallet 10, maxPerTx 1000, fee enabled
- Max supply: 6,000 (from config tuple) — OpenSea page showed 95 (stale) — TRUST ON-CHAIN

## Recon recipe (no OpenSea access needed)

### 1. Identify SeaDrop impl
```bash
# NFT contract address page → implementations[] → impl hash
curl -s "https://robinhoodchain.blockscout.com/api/v2/addresses/<NFT_CONTRACT>"
# → implementations: [{address_hash: "0x09a26f...", name: "ERC721SeaDropCloneable"}]
```

### 2. Get impl ABI — confirm mintSeaDrop / multiConfigure / getMintStats
```bash
curl -s "https://robinhoodchain.blockscout.com/api/v2/smart-contracts/<IMPL>"
# 49 functions; key: mintSeaDrop, multiConfigure, getMintStats, maxSupply, totalSupply
```

### 3. Find the SeaDrop contract address — decode an owner multiConfigure tx
```bash
curl -s "https://robinhoodchain.blockscout.com/api/v2/transactions/<OWNER_MULTICONFIGURE_TX>"
# decoded_input.parameters[0].value is the full config tuple:
# [maxSupply, baseURI, '', <SEADROP_ADDR>, [price, start, end, maxPerWallet, maxPerTx, feeFlag], ...]
```
Owner txs are easy to find: Blockscout address page → transactions → `method=multiConfigure`.

### 4. Get the SeaDrop ABI
```bash
curl -s "https://robinhoodchain.blockscout.com/api/v2/smart-contracts/<SEADROP_ADDR>"
# Name: SeaDrop, verified. Mint fns:
#   mintPublic(nft, feeRecipient, minterIfNotPayer, qty) [payable]  ← PUBLIC, no sig
#   mintAllowList(...) / mintSigned(...) / mintAllowedTokenHolder(...)
#   getPublicDrop(nft) [view]
```

### 5. Read drop schedule + wallet eligibility
```bash
# SeaDrop.getPublicDrop(nftContract) → current public stage params
# NFT.getMintStats(minter) → (mintedByWallet, totalMinted, maxSupply)
```
Convert startTime to operator TZ (start 1786503919 = 03:05 UTC = 10:05 WIB for GRUNKS).

## Mint call
```javascript
const seadrop = new ethers.Contract(SEADROP, ["function mintPublic(address,address,address,uint256) payable"], wallet);
const tx = await seadrop.mintPublic(NFT, FEE_RECIPIENT, wallet.address, qty, {
  value: price * BigInt(qty),
  chainId: 4663,                                            // WAJIB — ethers v6 signs 0 otherwise
  gasLimit: 400000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),          // Robinhood: hardcode
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
  type: 2,
});
```
**`feeRecipient` must NOT be `address(0)`** when the collection has required fees — the SeaDrop
reverts `FeeRecipientCannotBeZeroAddress()` (0x5136e8d5) EVEN for a 0-ETH free mint (verified
Hood Skunks). Use the OpenSea fee collector from the collection's `fees[]` (required entries,
e.g. `0x0000a26b00c1F0DF003000390027140000fAa719`) and set `minterIfNotPayer` to the minter's
own address. Ground truth: decode a recent SUCCESSFUL `mintPublic` tx via
`eth_getTransactionByHash` + `iface.decodeFunctionData` and copy its exact args.

## More worked examples (2026-08-12, both VERIFIED end-to-end)
- **Hood Skunks** (`0x[YOUR_WALLET_ADDRESS]`): FREE (price 0), maxPerWallet 3,
  48h window, maxTokenSupplyForDrop 1000 (NOT binding — supply passed it, mints kept working).
  10 wallets × 3 = 30 NFT, gas only (~$0.04).
- **Sushicat** (`0x[YOUR_WALLET_ADDRESS]`): PAID 0.00014 ETH, maxPerWallet 10,
  7-day window. 5 wallets × 10 = 50 NFT for 0.007 ETH + gas.
- Both used the SAME SeaDrop `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5` — one shared SeaDrop
  serves multiple Robinhood collections; `nftContract` is the arg.
- Reusable script: `templates/seadrop-public-mint-multiwallet.js` (dual-RPC retry, staticCall sim
  before broadcast, affordability math, handles free + paid).

## Multi-wallet plan (GRUNKS target)
- 10/wallet × 5 wallets = 50 GRUNKS, ~0.00053 ETH total (~$0.50)
- Balance-aware qty: `min(10, floor((balance - 0.0005) / price))`
- Sequential wallets with 2s spacing; one-shot cron at drop time +5s
- Same double-fire pitfall: check `hermes cron list` before manual runs

## Pitfalls
1. OpenSea page `total_supply` can be stale for fresh SeaDrop clones — always read on-chain.
2. `publicDrop()`, `mintPrice()`, `maxSupply()` on the NFT contract may revert — those live on
   the SeaDrop contract, not the NFT clone. Use `getPublicDrop(nft)` / `getMintStats(minter)`.
3. Decoding multiConfigure via raw eth_call needs the full tuple ABI; the Blockscout
   `decoded_input` already expands it — prefer the explorer endpoint over RPC for this.
4. **ethers v6 `new Wallet(pk, provider)` signs chainId 0** — RPC rejects with
   `invalid chain id for signer: have 0 want 4663` (surfaces as "could not coalesce error").
   Set `chainId: 4663` in the tx object.
5. **ethers v6 decode** — use `iface.decodeFunctionResult(name, data)`; the static
   `ethers.decodeFunctionResult` does not exist.
6. **Hot-drop RPC flakiness** — while a drop is being hammered, Robinhood RPCs intermittently
   return garbage (`could not coalesce error`, `missing revert data` on eth_call, sims that
   revert once then pass). Retry 3× alternating providers with backoff before concluding a
   sim failure; broadcast to whichever RPC accepts first. Don't skip a wallet on the first sim
   revert.
7. **staticCall-before-broadcast is the definitive live-check** — simulate the exact
   `mintPublic` (from=wallet, value=price×qty) and trust it over tuple fields:
   `maxTokenSupplyForDrop` was NOT binding on Hood Skunks (drop cap 1000, supply 6k+, mints
   kept succeeding). A passing sim = params + window + supply all OK.
8. **Paid-mint affordability**: `qty = min(maxPerWallet - minted, floor((balance - gas_reserve) / price))`
   with gas_reserve ~0.0006 ETH — verify EVERY wallet's balance before sending value.
