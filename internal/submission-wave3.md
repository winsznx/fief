# Wave 3 submission package

Deadline 2026-08-30 16:00. Everything below is drafted against what actually
shipped, so no line needs softening before it goes out.

## 1. Project information

**Name:** Fief

**One-liner (max 30 words):**
> A market for proof-carrying alpha. Trading agents commit every live call
> on-chain before the market moves, and the full 0G TEE-backed record becomes
> publicly verifiable after the edge expires.

**Short summary:**
> Trading bots can fake a backtest, and even a real track record can be edited
> by quietly deleting the losses. Fief makes that impossible to hide. An agent
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

Shot list. Every beat is backed by shipped code, which is the point: the
original screenplay showed a rental before the rental existed.

| t | shot | line |
|---|---|---|
| 0:00 | a bot listing with a glossy backtest | "Trading bots can fake a backtest. Worse, even a real record can be edited: just delete the losses." |
| 0:15 | ChainScan, `openEpoch` tx, spec expanded | "Fief fixes the schedule on-chain first. Market, cadence, horizon, deadlines, 144 slots, timestamped before any of it happened. The operator can't change it now." |
| 0:35 | terminal, `pnpm epoch`, slot fires | "A slot comes due. 0G Compute runs the inference inside a TEE and signs the receipt." |
| 0:50 | split: renter feed shows `UP`, ChainScan shows only a hash | "The renter sees the call. The public sees a commitment. That gap is what they're paying for." |
| 1:05 | renter terminal: `payload opens the on-chain commitment: true` | "And they don't have to trust us. They check the payload against the commitment the chain already holds." |
| 1:20 | `pnpm adversarial`, two rejections | "Commit after the deadline: rejected. That's the attack that makes fake records possible, closed on-chain." |
| 1:35 | the red tx on ChainScan, status success | "Flip one byte and reveal: rejected. Note the transaction succeeded, carrying the rejection as an event." |
| 1:50 | honest reveal lands, completeness ticks to 100% | "Reveal it honestly and it still works. A bad reveal can't be used to damage someone's record." |
| 2:05 | the live app, marketplace | "Every agent, read straight off mainnet. No indexer, no database." |
| 2:15 | an agent's completeness bar | "The denominator is the schedule, fixed before any of this happened. A slot the agent missed stays missed." |
| 2:25 | the slot timeline on /proof | "Sealed 98 seconds inside its deadline, and private for 338 seconds after that. That window is what a renter buys." |
| 2:40 | `cast call expectedTeeSigner`, clean terminal | "No frontend needed. The enclave key comes straight from 0G's own serving contract." |
| 2:55 | title card | "Fief. The same sealed strategy said this, at this time, before the answer was known." |

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

> Trading bots can fake a backtest. Even a real track record can be edited —
> just delete the losses.
>
> Fief makes agents commit every live call on-chain *before* the market moves.
>
> Renters get the signal while it's worth money. Everyone else gets the proof
> once it isn't.
>
> Live on @0G_labs mainnet:
> • schedule fixed on-chain before any outcome existed
> • every call committed inside its deadline from a TEE-signed 0G Compute receipt
> • sealed for 338s while the renter holds it, then revealed and verified byte-exact
> • every scheduled slot resolves publicly — a missed call stays missed
>
> Tamper one byte and the chain rejects it. Reveal honestly and the record is
> undamaged, so nobody can grief an agent's score.
>
> Live: fief.timjosh507.workers.dev
> RecordBook 0x40eB003340f467e096F8Ae30f8696bE40Eba922c
> github.com/winsznx/fief
>
> #0GBridge #BuildOn0G @0G_Builders @AKINDO_io

Attach: the completeness bar screenshot, or the 20s clip of the red tx being
rejected followed by the honest reveal landing.

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

**Traction and communication (10%).** Honest by construction: the marketplace
shows agents at 0% and 50% alongside the ones at 100%, because those runs really
did miss slots. A forward campaign is accruing a 288-slot record at a five-minute
cadence. Still the weakest axis, and the honest gap is external users: one
independent strategy author and one independent renter would be worth more here
than any further engineering.

## 8. Known gaps, stated rather than hidden

- **ERC-8004 `giveFeedback` is not exercised on-chain.** Serve-proof issuance is
  proven against the SDK's own verifier, but redemption needs an agent minted
  through a trusted attestor into 0G's TEE sandbox. Scoped in PRD v2 §16.2.
- **No third-party author or renter yet.** The rental was from a wallet we
  generated. It is a real second wallet, not the deployer, but it is not a
  stranger.
- **The UI has not had a design pass on the v2 surfaces.** The completeness bar
  and slot timeline are correct and accessible; they are not yet beautiful.
