# Upstream contributions

Things Fief built that belong to the 0G ecosystem rather than to Fief, and the
issues we hit that other builders will hit too.

## 1. `TeemlReceiptVerifier.sol` — on-chain TeeML receipt verification

[`contracts/src/TeemlReceiptVerifier.sol`](./contracts/src/TeemlReceiptVerifier.sol).
Stateless, dependency-free, MIT. Rebuilds the 129-byte signed text from a
request hash and the actual response bytes, applies the EIP-191 prefix, and
recovers the signer.

This is genuinely additive rather than a re-packaging. `processResponse` in
`0g-compute-ts-sdk` trusts the provider-returned `text` field and only
ecrecovers it, so a provider that signs over bytes it did not serve passes the
client check. Recomputing both hashes before recovery closes that, and doing it
on-chain means a contract can accept an inference receipt as evidence.

Offered as a standalone library plus an on-chain verification example for the
SDK docs.

## 2. Data-bound reputation for the Agentic ID SDK

The SDK's own guide notes that filtering reputation by an agent's current data
is designed but not yet implemented. Fief needs exactly that: strategy epoch 5
must not inherit epoch 2's score.

[`runtime/src/reputation.ts`](./runtime/src/reputation.ts) shows one way to do
it without an SDK change: bind the epoch's strategy commitment and the slot's
input hash into `dataHashes`, and commit `(agentId, epochId, slot, renter)` into
`taskHash`. A reputation reader can then filter feedback to the data version
that earned it. Worth upstreaming as a helper.

## 3. Findings other builders will hit

Reported here because each one cost real debugging time and none is documented
in an obvious place.

**Deploying to 0G needs explicit legacy gas.** `forge script … --broadcast`
will report `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, write a broadcast file,
and deploy nothing. The RPC returns a gas estimate of `0.000000015 gwei` against
a 2 gwei minimum, or computes a 1 wei tip cap on EIP-1559. Use
`--legacy --with-gas-price 4000000000`, and always confirm with `eth_getCode`
rather than trusting the script's own success message.

**Provider health is a live variable.** `openai/gpt-5.4-mini`
(`0x25F8f01c…`) returns a deterministic HTTP 502 `{"type":"zktls_error",
"code":50003}` with a funded sub-account and an acknowledged TEE signer.
`glm-5.2` (`0x7DCFe6…`) works. Pin a provider *set* and fail over.

**Reasoning models need real token headroom.** At `max_tokens: 256`, glm-5.2
spends the budget on reasoning and returns `finish_reason: "length"` with a
single character of content. That looks exactly like a model refusing an output
contract. Treat any `finish_reason` other than `stop` as a failure.

**`getProvidersWithBalance()` is the honest view of ledger allocation.** A
hand-written `InferenceServing.getAccount` ABI misdecoded a sub-account balance
by two orders of magnitude and sent us down the wrong path. Use the SDK's
accessors; the struct shapes are not guessable.

**The ERC-7857 draft verifier provides no cryptographic guarantees.**
`verifyPreimage` hardcodes `isValid = true` after a 32-byte length check, and
`verifyTransferValidity` checks only a receiver signature and a replay nonce,
with the TEE/ZKP proof left as a `// TODO` and `attestationContract` stored but
never read. Anyone forking `AgentNFT.sol` should know they inherit zero
verification. Issue to be filed against `0g-agent-nft`.

## Contributing to Fief

Branch from `main`, keep the reference model and the contracts in agreement, and
run the documented commands in [SETUP.md](./SETUP.md) before opening a PR. CI
runs exactly those commands.

Two rules that are not negotiable, because they are the product:

- **Never widen a claim.** If the code proves timing and completeness, the copy
  says timing and completeness. `scripts/check-claims.mjs` enforces this against
  the README, and `scripts/copy-guard.mjs` blocks the forbidden phrases.
- **The fixtures are the arbiter.** If Solidity and TypeScript disagree, exactly
  one is wrong. Do not adjust an expected value to make a test pass.
