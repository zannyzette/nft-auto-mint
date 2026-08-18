# Zero-ETH Claim Mint (receive() pattern) — Monkey coin, 2026-08

## The mechanic
A token contract that mints when you send **0 ETH** to it — no function call needed,
just a plain transfer. Detected on Robinhood (Monkey `0x[YOUR_WALLET_ADDRESS]`,
545k holders, supply 10^76). Twitter post ("transfer 0 ETH to claim") is the tell.

## Contract pattern (read the source before claiming)

```solidity
bool public launchActive = true;
uint256 public claimAmount = 1_000_000_000_000_000_000_000_000_000; // per-claim
mapping(address => bool) public claimed;

receive() external payable {
    if (launchActive) { _claim(); }
}

function _claim() internal {
    require(msg.value == 0, "Only zero ETH claim");   // must send 0
    require(msg.sender == tx.origin, "Contract not allowed"); // EOA only
    require(!claimed[msg.sender], "Already claimed");  // 1x per wallet
    require(balanceOf(address(this)) >= claimAmount, "Insufficient token");
    claimed[msg.sender] = true;
    _transfer(address(this), msg.sender, claimAmount);
}

function closeLaunch() external onlyOwner { ... transfer remaining to owner ... }
```

## Why it's safe when verified
- Verified source + `is_scam: false` on explorer
- **Zero-value guard** (`msg.value == 0`) — no way to steal ETH sent to it
- `msg.sender == tx.origin` — contracts can't claim (no bot contracts, only EOAs)
- `claimed[]` — strictly one claim per wallet
- No hidden `approve`/transfer-out in the source

## Claim execution (multi-wallet)
- Sending 0 ETH to the contract triggers `receive()` — a plain `sendTransaction({to: CA, value: 0})` works.
- Gas only (~$0.00002/tx on Robinhood). 10 wallets = 10 claims ≈ free.
- One claim per wallet — 10-wallet fleet = 10× the claim. (Respect project intent; no account farming beyond the fleet.)
- Verify after: `balanceOf(wallet)` increased by `claimAmount`.

## Scam variants to check before trusting the post
- Source NOT verified / `is_scam: true` → skip.
- `require(msg.value == 0)` missing → contract may be collecting value (skim/rug).
- No `claimed[]` guard → same wallet could spam (usually accompanied by a fee).
- Hidden `transfer`/`approve` on the contract owner path → rug potential.
- Always confirm the token contract on the explorer matches the CA in the post (link-swap scam).

## When to use
Any "social experiment / free mint by sending 0 ETH" post or project site with a
"mint by transfer" instruction. Classify under the 2-minute rule as **bot-able, zero-cost**
(per-wallet cap, no race — no signature, no gas war, just N claims from the fleet).
