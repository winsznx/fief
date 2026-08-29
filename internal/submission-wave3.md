# Wave 3 submission package

Deadline 2026-08-30 16:00. Everything below is drafted against what actually
shipped, so no line needs softening before it goes out.

## 1. Project information

**Name:** Fief

**One-liner (max 30 words):**
> Fief makes a trading agent's missing and losing calls publicly visible,
> without giving away the signal before it expires.

**Lead with the outcome, not the architecture.** Nobody is moved by four 0G
components or 242 tests. They are moved by: a bot cannot quietly delete the
calls that went wrong.

**Short summary:**
> Every trading bot's track record is editable. Not by forging signatures, but
> by simply not publishing the calls that went wrong. Fief closes that. An agent
> opens a forward epoch that fixes its schedule on-chain before any outcome is
> knowable, then commits every scheduled decision before its deadline as a
> sealed 0G Compute TEE receipt. Renters get the cleartext signal immediately
> and can verify it against the on-chain commitment before acting; the public
> sees only a hash until the market horizon passes, at which point the receipt
> is revealed and verified byte-exact against the agent's sealed strategy. Every
> scheduled slot resolves publicly to committed, missed or invalid, so
> completeness is a number nobody can edit after the fact.
>
> Uses 0G Chain (mainnet), 0G Compute TeeML, 0G Storage, and Agentic ID with
> ERC-8004 on testnet.

## 2. Code repository

https://github.com/winsznx/fief — public, MIT, commits throughout the wave.

Clean-clone reproduction verified 2026-08-25: **242 tests** pass from a fresh
clone (87 reference, 71 contracts, 77 web, 7 runtime) and the web builds. Steps
in [SETUP.md](../SETUP.md).

## 3. 0G integration proof

**Mainnet contract:** `0x40eB003340f467e096F8Ae30f8696bE40Eba922c` (RecordBook,
chainId 16661)

| what | tx |
|---|---|
| sealed strategy to 0G Storage | `0x8140d9b27b01eb3af8b5a5ac31ef0fbb0d9efdf3aca964b01eb220436ca53677` |
| agent registered (`H` + `storageRoot`) | `0x0b851c43676ff440c611ba7f8700e1f44bb0f059a06e28eeda32e20cd266c53f` |
| forward epoch opened | `0x7fc60c5c6db8d82605f4168b4c14f412d416272dc2d6b14c681518d9291d0527` |
| **sealed commit** | `0xb1cf572f94cb2404a7781f207b21883a5a444b5387d563b2e34ca5ad83f20cdb` |
| **reveal, verified** | `0xc8543dfc0a44adced1c35bce3b5f336feaba8e31ff658a81f2eab0bd249ade19` |
| **tampered reveal, rejected** | `0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b` |
| **canonical pair, same slot one byte apart** | green `0xc8543dfc…` / red `0x6d68ade3…` (agent 8, slot 1) |
| rental from a non-deployer wallet | `0x8ecc9978c206ce4072f4e744d70814fb568988ab31b0138ec615966e60d06ee1` |
| settlement | `0x5c7dcb515890142acbebf850956f014202f3e46c70833d0a56bb5902eab464ec` |

Four 0G components, each load-bearing rather than decorative. The strongest
single check a judge can run without a wallet:

```bash
cast call 0x40eB003340f467e096F8Ae30f8696bE40Eba922c \
  "expectedTeeSigner(address)(address)" 0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D \
  --rpc-url https://evmrpc.0g.ai
# -> 0xA46EA4FC5889AD35A1487e1Ed04dCcfa872146B9, read live from 0G's InferenceServing
```

## 4. Demo video (<= 3 min)

Shot list, timings and the exact commands live in
[video-runbook.md](video-runbook.md). Every beat there was run against mainnet
and timed, including the ones that turned out to be unfilmable, so nothing in
the recording depends on a command behaving differently than it did when the
list was written.

The beat that matters is the last third. Agent 7's first campaign stopped at
slot 33 of 288 because the machine slept, and 255 slots are permanently missed
on mainnet. The video shows that, on our own agent, next to the epoch that is
running now. It is the only moment where the system costs us something, and it
argues the thesis better than any passing check does.

Record at 1080p minimum, terminal at 16px+, ChainScan zoomed so hashes are
legible on a projector.

**Live app:** https://fief.timjosh507.workers.dev — Cloudflare Workers, reading
contracts and logs directly. No indexer sits between the chain and the screen.

**Independent verifier:** `packages/verify` recomputes the schedule, recounts
completeness and re-verifies a reveal byte for byte from its own calldata,
recovering the signer rather than reading the stored one back.

```bash
cd packages/verify && pnpm start -- --agent 8 --epoch 0   # 7/7
cd packages/verify && pnpm start -- --tx 0xc8543dfc…      # 6/6
```

## 5. Documentation

- [README.md](../README.md) — first screen, live addresses, the canonical run
- [ARCHITECTURE.md](../ARCHITECTURE.md) — mermaid sequence, contracts, 0G component table, honest limits
- [SETUP.md](../SETUP.md) — clean-clone reproduction, wallet-free verification
- [contracts/SLITHER.md](../contracts/SLITHER.md) — audit triage
- [SECURITY.md](../SECURITY.md) — what is proven, what is not, the sharp edges
- [claims.yaml](../claims.yaml) — every claim with its rung and evidence; CI fails on README drift
- [DECISIONS.md](../DECISIONS.md) — every load-bearing decision with its reason

## 6. Public X post

> Our own trading agent is sitting at 10.76% on mainnet right now.
>
> It committed 33 calls, then my laptop went to sleep and it missed 255. I
> can't reopen that epoch, backfill it, or delete it. It's public forever.
>
> That's Fief working.
>
> Every bot's track record is editable. Not by forging signatures, by simply
> not publishing the calls that went wrong. Fief fixes the schedule on-chain
> before any outcome exists, so a call that never shows up is a permanent,
> public Missed.
>
> Renters get the signal while it's worth money. Everyone else gets the proof
> once it isn't.
>
> Live on @0G_labs mainnet:
> • schedule timestamped before any outcome was knowable
> • every call committed inside its deadline from a TEE-signed 0G Compute receipt
> • sealed 338s while the renter holds it, then revealed and verified byte-exact
> • tamper one byte and the chain rejects it, and the honest record is undamaged
>
> Live: fief.timjosh507.workers.dev/agents/7
> RecordBook 0x40eB003340f467e096F8Ae30f8696bE40Eba922c
> github.com/winsznx/fief
>
> #0GBridge #BuildOn0G @0G_Builders @AKINDO_io

Attach: the "Every epoch, including the bad ones" panel on agent 7, showing the
abandoned epoch and the running one side by side. Nothing else in the project
argues the point as well, and it costs us to publish it, which is exactly why
it lands.

## 6b. Answers to the obvious questions

**"So it's a signature checker?"** No. Signature checking is table stakes and
0G's SDK already does a weaker version. The mechanism is the *schedule*: the
denominator is fixed on-chain before any outcome exists, so a call that never
appears is a permanent, public `Missed`.

**"Why can't the operator just start a new epoch when one goes badly?"** They
can, and it is visible. Every epoch ever opened is listed, including abandoned
ones, and lifetime completeness spans all of them. Made visible, not made
impossible, and the README says so.

**"Is the signal actually good?"** Unknown, and Fief never claims otherwise.
It proves provenance, timing and completeness. Profitability is not a
cryptographic property and pretending otherwise would poison the rest.

**"Does the strategy really go into the request?"** This is the honest gap. The
commitment is declared on the response side, so a dishonest owner could run a
request that omits the strategy while instructing the model to echo its hash.
Closed today by an authorized request audit, and by a ZK prefix opening later.
It is stated in SECURITY.md rather than buried.

## 7. Judging notes

**Progress (40%).** Wave 3 went from a specification with zero contracts to a
live mainnet deployment: forward epochs, commit/reveal, a Slither-audited
contract suite, a runtime, an ERC-8004 integration, a migrated UI, and a
settled rental. 242 tests from a clean clone.

**0G integration (30%).** Four components, each necessary. Chain timestamps the
schedule and holds the record. Compute produces the attributable inference and
its enclave key is recovered *on-chain*. Storage holds the sealed strategy whose
merkle root is registered with the agent. Agentic ID and ERC-8004 gate renter
feedback on a serve proof. Fief's on-chain check is strictly stronger than 0G's
own client SDK, which trusts the provider-returned text.

**Technical quality (20%).** A reference model the contracts test against so the
two cannot drift. Property tests on the completeness and conservation
invariants. A differential fuzz on the hand-written assembly. Slither before
deployment, with the one real finding fixed and the false positives argued
rather than dismissed.

**Traction and communication (10%).** The live app is at
https://fief.timjosh507.workers.dev. Honest by construction: the marketplace
shows agents at 0% and 50% alongside the ones at 100%, because those runs really
did miss slots.

The sharpest evidence arrived by accident. Agent 7 epoch 0 was a 288-slot
forward campaign at a five-minute cadence. The runtime stopped at slot 33 on
2026-08-25 at 20:32 UTC, no crash and nothing in the log, because the machine
went to sleep. The other 255 slots are now permanently `Missed` on mainnet. We
cannot reopen that epoch, cannot backfill it, and cannot delete it, so the
operator's own outage is a permanent public fact about the agent. That is the
whole thesis, demonstrated against us rather than by us. Agent 7 epoch 1 is
running now under a supervisor, with commits spooled to disk so a restart can
still reveal them.

Still the weakest axis, and the honest gap is external users: one independent
strategy author and one independent renter would be worth more here than any
further engineering.

## 8. Known gaps, stated rather than hidden

- **ERC-8004 `giveFeedback` is not exercised on-chain.** Serve-proof issuance is
  proven against the SDK's own verifier, but redemption needs an agent minted
  through a trusted attestor into 0G's TEE sandbox. Scoped in PRD v2 §16.2.
- **No third-party author or renter yet.** The rental was from a wallet we
  generated. It is a real second wallet, not the deployer, but it is not a
  stranger.
- **The UI has not had a design pass on the v2 surfaces.** The completeness bar
  and slot timeline are correct and accessible; they are not yet beautiful.
- **No rent transaction has been signed from a browser wallet.** The path is
  wired, simulated-first and deployed, and the same contract call is proven on
  mainnet through the CLI, but the browser signing step itself is unexercised.
- **Console writes beyond rent still throw** rather than returning an
  optimistic result. Minting, resealing and settling run through the runtime
  CLIs.
