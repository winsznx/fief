I went through the Fief PRD, the competition brief, the hackathon skill, current 0G docs, the current Agentic ID SDK, and the nearest projects already building in this exact space.

My verdict is REVISE, then LOCK.

Fief has a real first-place shape. The core engineering is much stronger than I expected from the premise. Your byte-exact verification of the 0G Compute receipt is especially good. The PRD verified that 0G's current client path trusts the provider-returned signed text, while Fief reconstructs `sha256(req):sha256(resp)` from the actual bytes before recovering the signer. That is a real technical distinction, not feature count. 

There are four things I would change before you let an implementation agent build the full backend.

### 1. The biggest problem is hidden in the current record design

Right now, Fief doesn't actually prove a complete trading track record.

The runtime is allowed to discard a decision if signature retrieval fails, nonce assignment only happens after successful signature retrieval, and there is explicitly no freshness requirement for submitting a decision on-chain. 

That opens a much worse attack than byte tampering.

Imagine the agent predicts:

12:00 DOWN
12:05 UP
12:10 DOWN
12:15 UP

The owner learns that the first and third calls were wrong. They can simply never publish those calls. The chain can then contain two perfectly authentic, TEE-signed, untampered winning calls.

Every individual receipt is legitimate.

The "track record" is still dishonest.

Your threat model almost notices this when it says the record proves provenance rather than alpha.  But the product promise currently says the track record "can't be faked."  Those two claims don't line up.

This should become one of Fief's strongest mechanisms rather than a disclaimer.

Add a forward-record session.

An agent starts an epoch before the market outcomes are known. That epoch fixes the market, strategy version, cadence, evaluation horizon, start time and maximum commit delay. Slots then become deterministic.

For example:

`Epoch 7 / BTC-USDT / 5m / slot 182 / snapshot 12:05 / commit deadline 12:05:30`

Every scheduled slot must resolve to `Committed`, `Missed`, `Invalid` or another explicit terminal state. There should be no disappearing slots.

Then the record exposes:

`143 / 144 expected decisions committed`
`99.3% completeness`
`1 missed`
`0 late`
`0 invalid`

Now Fief proves something Zero Arena and ordinary agent receipt systems don't automatically prove:

> The record was committed prospectively, before the answer was knowable, and the operator can't quietly remove losing calls.

That's much closer to a genuinely trustworthy trading record.

### 2. Your current public calldata destroys the rental economics

This is the other major issue.

The PRD says `respData` is public by design because "it is the decision." 

But Fief charges people to rent the decision stream.

If UP/DOWN/FLAT is sitting in public calldata as soon as the inference occurs, nobody needs to rent the agent. A bot can watch `RecordBook` and copy every live signal for free.

I would restructure the entire record lifecycle around:

`private alpha now -> public proof later`

At signal time, the runtime obtains the exact TeeML receipt. The renter receives the clear signal immediately through their authorized Fief feed. Publicly, Fief commits the signed `reqHash`, `respHash`, slot, provider and receipt commitment before the market horizon expires.

After the signal has lost its trading value, Fief reveals the request/output evidence required for full public verification. The contract then performs the expensive byte-exact reconstruction you already designed.

That gives you a much stronger product:

> Rent the signal while it's valuable. Verify the complete record after the edge has expired.

It simultaneously solves monetization, forward-test integrity and strategy distribution.

It also gives Fief a distinctive visual mechanic:

`12:05 COMMITTED → private to renters → 12:10 REVEALED → outcome resolved`

The public can verify that the prediction existed before the outcome without receiving the alpha for free beforehand.

This is the version of Fief I'd build.

### 3. The competitive landscape is much more dangerous than the PRD reflects

Zero Arena is almost directly on your territory already. It describes itself as an on-chain arena for AI trading agents where backtests qualify agents, live seasons prove them, every epoch is committed on-chain, and strategies remain sealed on 0G Storage. It already has five contracts on 0G mainnet, an SDK, live seasons and a prize-paying lifecycle. ([HackQuest][1])

NEXUS is also being built for the same 0G Bridge. It combines ERC-7857 encrypted brains, 0G Storage, TEE inference, proof receipts, reputation and escrow. ([GitHub][2])

So I would stop framing Fief primarily as "verifiable trading agents."

The differentiated category should become something closer to:

> Fief is a market for proof-carrying alpha. Rent private trading signals whose complete forward record is committed before the market moves and cryptographically tied to the sealed agent that produced them.

That separates the products cleanly.

| Product    | Main mechanism                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- |
| Zero Arena | prove trading agents through competitive live seasons                                    |
| NEXUS      | general proof and reputation layer for AI agents                                         |
| Fief       | sell private live alpha with pre-outcome commitment and post-outcome cryptographic proof |

The key Fief sentence becomes:

> The same sealed strategy said this, at this time, before the answer was known.

That's stronger than "this inference has a TEE signature."

### 4. I would update the Agentic ID architecture before implementing `FiefAgent`

This is important because 0G has moved since the PRD's pinned draft.

Your PRD is deliberately based on the `eip-7857-draft` branch and consequently works around a permissive verifier, an old two-argument `authorizeUsage`, and the old transfer format. 

Current 0G documentation now specifies `authorizeUsage(tokenId, executor, permissions)` and a transfer interface carrying `from`, `to`, `tokenId`, `sealedKey` and `proof`. 0G also now explicitly separates ERC-7857 encrypted intelligence ownership from ERC-8004 public identity and reputation. ([0G Documentation][3])

More importantly, there is now an official `@0gfoundation/0g-agenticid-sdk`. It has agent lifecycle management, encrypted `iData`, sealed runtimes, a TEE-held `agentSeal`, ERC-8004 reputation and TEE-signed serve proofs. The serve proof contains `agentId`, timestamp, `taskHash`, `dataHashes`, `frameworkHash` and a signature, and its verifier checks that the signer matches the on-chain agent seal and that the referenced data hashes are actually on-chain. ([GitHub][4])

That is almost tailor-made for closing one of your existing trust seams.

I would make official Agentic ID the identity/runtime layer, then let Fief add the thing 0G doesn't supply:

`Agentic ID identity + sealed data`
→ `Fief forward-slot commitment`
→ `0G Compute byte-exact inference receipt`
→ `private rental delivery`
→ `delayed reveal`
→ `Fief objective performance record`

Don't throw away `TeemlReceiptVerifier`. That's one of your best pieces.

I would throw away or heavily reconsider the custom outdated `FiefAgent` fork.

There is also a fresh official Storage package now. Your PRD still plans a gate around the deprecated `@0glabs/0g-ts-sdk@0.3.3`.  The current Builder Hub points TypeScript builders to `@0gfoundation/0g-storage-ts-sdk`, and npm shows the old package as explicitly deprecated. ([0G Builder Hub][5])

I would move immediately to the current SDK rather than spending engineering effort proving a deprecated integration still works.

### What the complete Fief should contain

I would make these the substantive PRD additions:

1. Add `ForwardEpoch` and `DecisionSlot`. Every live performance epoch is registered before it starts, with strategy version, asset, cadence, horizon and submission deadline. Nonce ordering alone is no longer enough.

2. Split `recordDecision` into a commit/reveal lifecycle. `commitDecision` happens while the signal has value. `revealDecision` happens after the configured disclosure delay and reconstructs the exact 0G TEE-signed response.

3. Make missing evidence visible. Don't keep the canonical performance ledger accepted-only. Your existing accepted-only design is useful for the receipt registry, but the performance record needs rejected, missed and late slots too. The PRD currently intentionally removes rejected decisions from `entries[]`. 

4. Bind rentals to a strategy epoch. A renter who bought epoch 4 shouldn't silently start receiving epoch 5 after the author replaces the brain. A strategy update should require renter re-consent or pause/refund the grant.

5. Keep two reputation systems separate. Fief's objective record should contain mechanically recomputable trading evidence. ERC-8004 should contain actual renter feedback. 0G has deployed ERC-8004 identity and reputation registries on mainnet and Agentic IDs can be discoverable through the wider ERC-8004 ecosystem. ([0G Documentation][6]) This gives you distribution outside Fief without inventing another reputation contract.

6. Add forward-performance metrics, not just P&L. I would expose completeness, sample size, directional hit rate, calibration/Brier score where confidence is used, hypothetical fixed-rule return, drawdown, decision latency and strategy age. Clearly distinguish signal performance from executed P&L because Fief doesn't execute renter trades.

7. Make the live feed a real product surface. A renter should be able to consume a signal in-app and through an authenticated API/webhook. The response should carry its proof so a sophisticated renter can verify before acting.

8. Build third-party author onboarding. Your own agents are good seed supply, but one genuinely separate strategy author plus one separate renter wallet is substantially more valuable than adding ten more self-owned agents. The official judging rubric allocates 10% to real usage, communication and traction, and the competition explicitly accepts user-testing evidence as bonus material.  

9. Run a 100-plus-slot forward campaign. Don't manufacture 100 identical test transactions. Run actual scheduled BTC decisions. Publish expected slots, committed slots, misses, rejects, latency, Compute calls, storage roots and mainnet transactions. That gives you wide proof on top of your deep cryptographic proof.

10. Turn Fief's verifier into a first-class public product. `fief verify --agent 12 --epoch 4` should reconstruct epoch completeness, verify receipt signatures, check reveal hashes, verify strategy-version binding and recompute performance from the public evidence. A judge shouldn't need your frontend to believe you.

### There is also a phase-order bug in the PRD

Your current P5 is the Wave 3 submission package.

Rental isn't implemented until P6, which is labeled Wave 4. Live agents and record depth are P7. Marketplace polish is P8. 

But your already pre-committed Wave 3 video includes a second-wallet rental at 1:15. 

That violates your own submission synchronization rule.

I would move the whole dominant commercial loop into the current build:

`author seals → lists → agent begins forward epoch → renter pays → receives private signal → chain commits it → disclosure window passes → receipt reveals → result scores → renter can leave ERC-8004 feedback`

Transfer/buying can still exist in the full product. It doesn't deserve equal narrative weight in the Wave 3 demo.

### The business actually becomes much better after commit/reveal

Your existing 200 bps take rate is clean and sufficient as an initial model. 

The missing part was why anyone would pay when the decision itself was public.

With delayed disclosure, the economics finally line up:

Authors monetize proprietary alpha without publishing their strategy or giving away live calls.

Renters pay for time advantage plus provenance. They retain custody and execution.

Fief earns on paid access.

The public delayed record becomes the author's acquisition channel. Better forward performance attracts more renters, more rentals create more independent feedback, and every new paid inference generates more 0G usage.

That is a real marketplace flywheel rather than an NFT marketplace wrapped around proofs.

### Current 0G fit becomes exceptionally strong

The official Agentic ID docs literally list AI trading bots and transferable profitable strategies as a core use case. Agentic ID combines encrypted ownership, authorized usage, secure transfer and 0G Storage, while ERC-8004 adds portable discovery and reputation. ([0G Documentation][7])

Fief can use the stack causally:

| 0G primitive              | Load-bearing Fief role                                     |
| ------------------------- | ---------------------------------------------------------- |
| 0G Compute TeeML          | produces the cryptographically attributable inference      |
| InferenceServing contract | authoritative TEE signer used in acceptance                |
| 0G Chain                  | timestamps forward commitments, rentals and eventual proof |
| 0G Storage                | encrypted strategy and evidence artifacts                  |
| Agentic ID / ERC-7857     | sealed intelligence ownership and lifecycle                |
| ERC-8004                  | discovery plus independent renter reputation               |

I wouldn't bolt 0G Pay or DA onto it just to say six integrations. Your skill explicitly values causal integration over endpoint count. 

The depth is already there.

### Score budget

The actual rubric is 40% progress, 30% 0G integration, 20% technical execution and 10% traction/communication.  Wave 3 also explicitly requires a 0G mainnet contract, explorer activity and proof of integration. 

I can't establish a reliable historical winning cutoff for this exact 2026 Wave, so I wouldn't fake one. My forecast is:

| Category                 | PRD as currently written and shipped through P5 | Revised Fief, if actually delivered |
| ------------------------ | ----------------------------------------------: | ----------------------------------: |
| Progress & Momentum      |                                      31-34 / 40 |                          37-39 / 40 |
| 0G Integration           |                                      25-27 / 30 |                          28-30 / 30 |
| Technical Quality        |                                      18-19 / 20 |                          19-20 / 20 |
| Traction & Communication |                                        3-5 / 10 |                           8-10 / 10 |
| Total                    |                                           77-85 |                               92-99 |

The most important thing in that table is that another thousand tests won't fix the current lowest category. Your skill explicitly says to spend additional work where the real rubric still has headroom rather than polishing an already-leading category. 

Fief already has enough technical ambition.

It needs economic coherence, prospective completeness and real independent usage.

### The demo I'd optimize toward

Opening sentence:

> Trading bots can fake a backtest. Fief makes them commit every live call before the market moves.

Then show a running agent. One scheduled slot appears. 0G Compute produces the inference. The chain gets the commitment. Wallet B, the renter, can see `UP`, while the public only sees the sealed commitment.

Try to submit a different answer or submit after the slot deadline. Red rejection.

Advance to a previous completed slot. Reveal the exact response. Fief recomputes the 0G receipt against the authoritative TEE signer. Show the market outcome and update the forward score.

Then zoom out:

`127 expected`
`127 committed`
`124 revealed`
`3 pending`
`0 missing`
`0 backfilled`

Finally run:

`fief verify ...`

and let the independent verifier reach the same result.

That is a much stronger three minutes than spending 40 seconds explaining NFT transfer mechanics. The competition itself requires the video to show core functionality, user flow and 0G integration within three minutes. 

### One more thing that could earn serious ecosystem residue

Keep the reusable `TeemlReceiptVerifier` contribution.

Also investigate the current Agentic ID SDK's explicit missing piece around data-bound reputation. Its own guide says reputation filtering by the agent's current data is designed but not yet in the SDK. ([GitHub][8]) Fief needs exactly that because strategy epoch 5 shouldn't inherit an undifferentiated reputation score from strategy epoch 2.

A clean upstream contribution that makes reputation strategy/data-hash aware would be much stronger than filing an issue against the obsolete permissive ERC-7857 draft.

So the version I would lock is:

> Fief is a marketplace for private, proof-carrying trading alpha. Agents commit every live decision before the market moves, renters receive the signal while it matters, and the full 0G TEE-backed record becomes publicly verifiable after the edge expires.

That has a product reason for privacy, a product reason for 0G Compute, a product reason for Agentic ID, a product reason for Chain, a product reason for Storage, a measurable business loop, a devastating failure-path demo, and a much cleaner distinction from Zero Arena and NEXUS.

I would change the PRD around this before handing it to the build agent. I would not build the current P6/P7/P8 ordering as written.

I can also watch the current 0G SDKs, Agentic ID changes and Wave 3 competition surface for anything that affects the architecture while you build.

[1]: https://www.hackquest.io/zh-cn/projects/Zero-Arena "https://www.hackquest.io/zh-cn/projects/Zero-Arena"
[2]: https://github.com/harsh11067/NEXUS "https://github.com/harsh11067/NEXUS"
[3]: https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857 "https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857"
[4]: https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md "https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md"
[5]: https://build.0g.ai/sdks "https://build.0g.ai/sdks"
[6]: https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc8004 "https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc8004"
[7]: https://docs.0g.ai/concepts/agentic-id "https://docs.0g.ai/concepts/agentic-id"
[8]: https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/GUIDE.md "https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/GUIDE.md"
