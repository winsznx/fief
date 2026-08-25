# Slither triage

`slither . --exclude-dependencies --filter-paths "lib/|test/|script/"` — Slither 0.11.5, Solc 0.8.28.

Run 2026-08-25 against the P2 contracts, before mainnet deployment.

| | before | after |
|---|---|---|
| High | 2 | 1 |
| Medium | 3 | 1 |
| Low | 20 | 17 |

Everything still reported is analysed below. Nothing is dismissed without a reason and, where the reason is "a test covers it", the test is named.

## Fixed

### High · `arbitrary-send-eth` — RentalDesk pushed ETH

Real, and the most serious finding of the run. `_pay` used `call{value:}` to the agent owner and the treasury during `settle`. A payee that reverts on receive would make every settlement revert, freezing settlement for an honest renter. It also contradicted the PRD's own §5 line, "Pull pattern, no push transfers", which the implementation had simply not honoured.

Fixed by crediting `withdrawable[payee]` and adding `withdraw()`, which zeroes the balance before transferring so a reentrant call finds nothing. A hostile payee can now only fail their own withdrawal.

Covered by `test_hostileOwnerCannotBlockSettlement` and `test_withdraw_zeroesBeforeSendingAndRejectsEmpty`.

### Medium · `uninitialized-local` ×2 — `gross`, `count` in `settle`

Harmless in practice, since Solidity zero-initialises. Made explicit anyway; the cost is nothing and the reader no longer has to know the rule.

### Low · `missing-zero-check` ×2

`RentalDesk`'s constructor now rejects a zero treasury, which would otherwise burn every protocol fee silently. `EpochBook.setRecordBook` now rejects a zero address, which would brick the counters with no way to re-set it because the setter is one-shot.

### Found by reading, not by Slither

`g.settledCount` was never incremented. The allowance check therefore only bound a single call, and `grantOf().settledCount` always read zero, which would have misled any UI built on it. Escrow still bounded consumption correctly, so this was not a fund bug, but it was state that lied. Covered by `test_settledCountPersistsAcrossCalls`.

A `MAX_SETTLE_SLOTS` cap of 256 was added so a caller cannot build a `settle` transaction that runs out of gas partway. Covered by `test_settle_rejectsOversizedSlotArray`.

## Not fixed, with reasons

### High · `signature-replay-bypass` — "no nonce tracking" in `revealDecision`

False positive. There is no separate nonce because **the slot index is the nonce**, and it is bound three ways:

1. `receiptCommit` is stored per `(agentId, epochId, slot)` at commit time, and the reveal must open exactly that commitment.
2. The TEE-signed response must contain the commit line, which names `book`, `chain`, `agent`, `epoch` and `slot`. The contract rebuilds those bytes from its own state and memcmps.
3. A revealed slot sets `revealedAt`, and a second reveal reverts `AlreadyRevealed`.

So a genuine receipt cannot be moved to another slot, another epoch, another agent, another deployment, or replayed into its own slot twice. Both halves are tested: `test_reveal_rejectsCrossSlotReplay` (a real signed receipt for slot 1 replayed into slot 0 reverts `BadCommit`) and `test_reveal_cannotRevealTwice`.

### Medium · `incorrect-equality` — `m.abandonedAt == 0`

False positive. `abandonedAt` is a timestamp sentinel where zero means "not abandoned", not a balance. Strict equality is exactly right.

### Low · `timestamp` ×9

Deliberate, and the whole point of the design. Fief's claim is that a decision was committed before a deadline, so every meaningful check is a timestamp comparison. The windows are minutes (a 300s cadence with a 30s commit delay in the reference spec); validator drift is seconds. A proposer able to shift `block.timestamp` a few seconds cannot manufacture a late commit that matters, and cannot move an epoch's `startTime` into the past at all, because that is checked at open time against the same clock.

### Low · `reentrancy-events` ×5

Events emitted after external calls. The external calls are to `EpochBook` (our own contract, guarded by `onlyRecordBook`) and, in `withdraw`, to the payee after state is already zeroed. No state that matters is read after the call. Left as is.

### Low · `calls-loop`

`records.entryOf` inside the `settle` loop is a view call to our own contract, and the loop is now bounded by `MAX_SETTLE_SLOTS`.

### Low · `events-access`, `naming-convention`, `assembly` ×2, `low-level-calls`

Informational. The two assembly blocks are deliberate and are the most heavily tested code in the repo: `Bytes.equalsAt` is fuzzed against a naive byte-wise implementation (`testFuzz_equalsAt_matchesNaive`, `testFuzz_equalsAt_detectsSingleByteFlip`), and `TeemlReceiptVerifier.recover` is exercised against reference fixtures plus a wrong-key case.

### `operator-fee-outlier` ×2

Not a Slither core detector; emitted by a third-party plugin present in this environment. Reports that `openEpoch` and `settle` contain loops. Both are bounded, by the pinned provider set and by `MAX_SETTLE_SLOTS`.
