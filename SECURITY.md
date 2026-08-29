# Security

Fief's claim is narrow on purpose. This document states exactly what the system
proves, what it does not, and where the sharp edges are. If a sentence here
disagrees with marketing copy anywhere else in the repo, this one is correct.

## What is proven

Given agent N with sealed strategy hash H in epoch E, whose schedule was fixed
on-chain before its own first slot:

1. Every revealed entry carries an ECDSA signature over
   `sha256(request):sha256(response)` that recovers, **on-chain**, to the TEE
   signer 0G's own `InferenceServing` contract registers for that provider.
2. The response bytes hashed on-chain contain a commitment line naming the book,
   chain, agent, epoch, slot, strategy hash, input hash and renter, rebuilt by
   the contract from its own state.
3. Every commitment landed before its slot deadline.
4. Every scheduled slot resolves to exactly one of revealed, missed or invalid.

Anyone can recheck all four from public data with `packages/verify`, without
trusting this repo, its frontend, or its operator.

## What is not proven

- **Profitability.** The record proves provenance, timing and completeness. It
  says nothing about whether the calls made money. P&L shown anywhere in the UI
  is labelled context and is not verified.
- **That the request contained the strategy.** The request holds the secret, so
  only its hash is public and the commitment is declared on the *response* side.
  A dishonest owner could run a request that omits strategy H while instructing
  the model to echo H. Closed today by an authorized request audit, and by a ZK
  prefix opening later. This is the single most important limit on the page.
- **Anything about the ERC-7857 draft verifier.** Fief no longer forks it.
- **Mainnet Agentic ID or ERC-8004.** Agentic ID and ERC-8004 are **testnet only**, and the wording matters because
  bytecode does exist at the canonical ERC-8004 address on mainnet. Verified
  2026-08-25:
  
  | address | mainnet 16661 | testnet 16602 |
  |---|---|---|
  | AgenticID proxy `0x34493302…` | no code | 295 B, live |
  | ReputationRegistry `0xede70197…` | no code | 295 B, live |
  | canonical ERC-8004 `0x8004A818…` | 130 B ERC-1967 proxy, **every read reverts** | `name()` returns `AgentIdentity` |
  
  So the mainnet address is a proxy shell with no working implementation behind
  it. It is not usable, and the production attestor (`agenticid.0g.ai/config`)
  serves chain 16602. Anyone can check this with `cast code` and
  `cast call … "name()"`.

## Threat model

| threat | mitigation | enforced by |
|---|---|---|
| forged receipt | on-chain ecrecover against the registered TEE signer | `RecordBook.revealDecision` |
| publish only the winners | schedule fixed before outcomes; every slot accounted for | `EpochBook`, invariants I11/I13 |
| wait for the outcome, then commit | `block.timestamp <= slotCommitDeadline` | `RecordBook.commitDecision`, I12 |
| open an epoch over a resolved window | `startTime >= block.timestamp` | `EpochBook.openEpoch`, I11 |
| tamper the revealed bytes | reveal must open the published commitment | I14 |
| replay a genuine receipt into another slot | commit line names book, chain, agent, epoch, slot | `EXP` memcmp |
| sit on a losing call, never reveal | reveal is permissionless, so anyone holding the payload can publish it; and an unrevealed slot resolves to `invalid` at finalize either way | by design, but see **No signal delivery** below |
| grief an agent with bad reveals | a failed reveal changes no state; invalid is derived at finalize | `RecordBook` |
| block settlement by refusing payment | pull payments; a hostile payee breaks only their own withdrawal | `RentalDesk.withdraw` |
| operator key theft | rotate via `setOperator`; junk reveals fail verification | `FiefAgent` |
| strategy leakage | AES-256-GCM app-side; only hashes on chain | runtime, I4 |
| renter distillation | rate limits and the disclosure delay; documented residual | partial |
| rate an agent you never used | ERC-8004 `giveFeedback` requires a serve proof bound to you | upstream |

## Known sharp edges

- **No signal delivery.** This is the largest gap in the product and it is not a
  cryptographic one. A renter can escrow on-chain and then receive nothing,
  because nothing delivers the cleartext to them. `RenterMessage` is produced
  inside the runtime process and never leaves it; there is no API, no feed and
  no route in the web app that serves it. In `runtime/src/cli/rental.ts` the
  "renter" is a variable in the same script, which is why that flow completes.

  It matters for the threat model, not just for usability. Two mitigations above
  assume a renter is actually holding a payload: "sit on a losing call" relies
  on someone other than the operator being able to publish it, and "renter
  distillation" is only a real risk once renters receive outputs at all. Today
  the operator is the sole holder of every payload before reveal, so the
  permissionless-reveal mitigation is theoretical rather than exercised.

  What is genuinely proven is narrower and worth stating precisely: a payload,
  *once a renter has it*, can be verified against the on-chain commitment before
  any reveal exists. Getting it to them is unbuilt.

- **Epoch shopping.** An author can abandon a bad epoch and open a fresh one.
  Not preventable; made visible instead. Every epoch ever opened is listed,
  including abandoned ones, and lifetime completeness spans all of them.
- **Admin pin.** `RecordBook.pinSigner` can override the live signer read. It is
  admin-only, evented, requires an evidence URI, and **is not set on mainnet**
  (`pinnedSigner` returns the zero address). It exists for the documented
  testnet narrowing. Verify before trusting any deployment.
- **`revealDecisionStrict`.** A demo affordance that catches the revert and
  emits `DecisionRejected` so a rejection reads as a successful transaction on
  an explorer. It writes no state and the runtime does not use it.
- **Single operator.** One EOA commits for an agent. Its compromise means junk
  submissions, not a forged record: junk fails verification at reveal.

## Auditing

Slither 0.11.5 was run before mainnet deployment. Full triage, including why the
two remaining findings are false positives, is in
[contracts/SLITHER.md](./contracts/SLITHER.md). One real bug was found and
fixed: `RentalDesk` pushed ETH, which let a payee that reverts on receive
permanently block settlement.

No third-party audit has been performed. This is hackathon-stage code holding
small amounts of real value; treat it accordingly.

## Reporting

Open an issue at https://github.com/winsznx/fief/issues. There is no bug bounty.
