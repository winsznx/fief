# Setup and reproduction

Everything below was run from a clean clone on 2026-08-25. Nothing here needs a
key except the sections marked **needs a funded wallet**, and those are clearly
separated so a judge can verify the bulk of the project without one.

```
node >= 22    pnpm 11    foundry (forge 1.7+)
```

## Verify without a wallet

This is the whole test suite. 242 tests, no network, no key.

```bash
git clone https://github.com/winsznx/fief.git && cd fief

(cd packages/reference && pnpm install && pnpm verify)   # 87 tests
(cd contracts && forge install foundry-rs/forge-std --no-git && forge test)  # 71 tests
(cd web && pnpm install && pnpm verify)                  # 77 tests + lint, copy-guard, contrast
(cd runtime && pnpm install && pnpm verify)              # 7 tests
```

The contract suite imports its expected values from
`packages/reference/fixtures/slots.json` rather than restating them, so
`forge test` passing means Solidity and the TypeScript reference model agree
byte-for-byte. If they ever disagree, exactly one is wrong and the fixture
decides which.

Run the UI against mock data:

```bash
cd web && pnpm dev     # http://localhost:3000
```

`/proof` is the two-minute path: the slot timeline, the byte-level diff, the
accepted and rejected pair, and the verify command.

## Verify what is on chain, without a wallet

Nothing here signs anything.

```bash
# The record book, live on 0G mainnet
cast call 0x40eB003340f467e096F8Ae30f8696bE40Eba922c \
  "isRevealed(uint256,uint64,uint32)(bool)" 5 0 0 \
  --rpc-url https://evmrpc.0g.ai

# The enclave key it will accept, read live from 0G's own serving contract
cast call 0x40eB003340f467e096F8Ae30f8696bE40Eba922c \
  "expectedTeeSigner(address)(address)" 0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D \
  --rpc-url https://evmrpc.0g.ai

# No admin override is set, so the line above really is a live read
cast call 0x40eB003340f467e096F8Ae30f8696bE40Eba922c \
  "pinnedSigner(address)(address)" 0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D \
  --rpc-url https://evmrpc.0g.ai

# Published completeness for agent 5, epoch 0, in basis points
cast call 0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8 \
  "completenessBps(uint256,uint64)(uint32)" 5 0 \
  --rpc-url https://evmrpc.0g.ai
```

The ERC-8004 leg needs no wallet either:

```bash
cd runtime && pnpm reputation
```

It reads the production attestor's live config, checks the registry addresses
this repo pins still match, and issues a serve proof that is verified by the
Agentic ID SDK's own verifier rather than by ours.

## Needs a funded wallet

These spend real OG. `PRIVATE_KEY` must hold mainnet OG for gas and have a
funded 0G Compute ledger (3 OG minimum to create one, see
[0G docs](https://docs.0g.ai/)).

```bash
cd runtime

# One forward epoch: seal, register, open, commit, reveal, report completeness
NETWORK=mainnet PRIVATE_KEY=0x… pnpm epoch

# The failures, which matter as much as the successes
NETWORK=mainnet PRIVATE_KEY=0x… pnpm adversarial

# Every canonical submission artifact in one run, including 0G Storage
NETWORK=mainnet PRIVATE_KEY=0x… pnpm showcase

# The commercial loop from a generated renter wallet
NETWORK=mainnet PRIVATE_KEY=0x… pnpm rental

# Settle revealed slots and withdraw
NETWORK=mainnet PRIVATE_KEY=0x… AGENT=6 RENTER=0x… SLOTS=0 pnpm settle
```

Omit `NETWORK=mainnet` to run against 0G Galileo testnet 16602 instead. Testnet
needs a faucet top-up and, because a testnet `RecordBook` cannot resolve a
mainnet Compute provider through its local `InferenceServing`, the runtime pins
the TEE signer with linked evidence there. On mainnet no pin is set and the
signer is read live.

### Deploying your own

```bash
cd contracts
PRIVATE_KEY=0x… forge script script/Deploy.s.sol \
  --rpc-url https://evmrpc.0g.ai --broadcast --slow \
  --legacy --with-gas-price 4000000000
```

The gas flags are not optional on 0G. Without them the RPC returns a bogus
estimate or computes a 1 wei tip cap, and forge writes a broadcast file with
zero receipts **while reporting success**. Always confirm afterwards:

```bash
cast code <address> --rpc-url https://evmrpc.0g.ai | wc -c
```

## Regenerating fixtures

```bash
cd packages/reference && pnpm fixtures
```

Output is byte-identical across runs, so a diff in CI means a real behavioural
change rather than noise. The Foundry suite consumes the result, so regenerate
and re-run `forge test` together.

## Known environment notes

- **0G testnet RPC gas estimates are unreliable.** Use the explicit flags above.
- **Provider health is a live variable.** `openai/gpt-5.4-mini`
  (`0x25F8f01c…`) returns a deterministic 502 `zktls_error` even with a funded
  sub-account. `glm-5.2` (`0x7DCFe6…`) works. An epoch pins a provider *set* and
  the runtime fails over inside the commit deadline.
- **Reasoning models need token headroom.** At `max_tokens: 256`, glm-5.2 spends
  the budget on reasoning and returns `finish_reason: length` with one character
  of content, which looks exactly like the model refusing the output contract.
  The runtime treats any non-`stop` finish reason as a slot failure.
