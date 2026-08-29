# Fief

**A market for proof-carrying alpha. Rent private trading signals whose complete forward record is committed before the market moves and cryptographically tied to the sealed agent that produced them.**

Fief is an AI × onchain marketplace on [0G](https://0g.ai). An agent opens a **forward epoch** that fixes its market, cadence, horizon and deadlines before any outcome is knowable. At every scheduled slot it commits a **TEE-signed 0G Compute receipt** on-chain before the slot deadline. The public sees only a sealed commitment until the market horizon passes; a renter holding the cleartext can check it against that commitment before acting. After the horizon, the receipt is **revealed and verified byte-exact on-chain** against the agent's sealed strategy commitment. Every scheduled slot resolves publicly to Committed, Missed or Invalid, so the record is complete by construction and losing calls cannot be quietly deleted. The strategy itself stays encrypted on 0G Storage; only hashes touch the public chain.

**Live app: https://fief.timjosh507.workers.dev** — reads the record straight off 0G mainnet, no indexer, no wallet needed.

> **Status: live on 0G mainnet (chainId 16661).** A real forward epoch has run end to end: schedule fixed before any slot existed, every slot committed inside its deadline from a real TEE-signed 0G Compute inference, every slot revealed and verified byte-exact on-chain, completeness 100%. Contracts audited with Slither before deployment ([triage](./contracts/SLITHER.md)). Target: **0G Bridge by AKINDO, Wave 3.**

## Live on 0G mainnet

| contract | address |
|---|---|
| RecordBook | [`0x40eB003340f467e096F8Ae30f8696bE40Eba922c`](https://chainscan.0g.ai/address/0x40eB003340f467e096F8Ae30f8696bE40Eba922c) |
| EpochBook | [`0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8`](https://chainscan.0g.ai/address/0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8) |
| FiefAgent | [`0x4db74faF047160893Aa0dabC9A1B8F3297570a68`](https://chainscan.0g.ai/address/0x4db74faF047160893Aa0dabC9A1B8F3297570a68) |
| RentalDesk | [`0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57`](https://chainscan.0g.ai/address/0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57) |

The canonical run (agent 8, epoch 0), all on mainnet:

| step | tx |
|---|---|
| sealed strategy uploaded to **0G Storage** | [`0x3145495a…`](https://chainscan.0g.ai/tx/0x3145495ab3f9158913b46c06b2577d7794d0aeb24ec437266c91e99e3f09d16e) |
| agent registered with `H` + `storageRoot` | [`0x8b477532…`](https://chainscan.0g.ai/tx/0x8b4775328c24f4b89a4afaaa39b440392b02399834eb71f8a631760bfea70bc0) |
| forward epoch opened, schedule fixed | [`0x64debb3d…`](https://chainscan.0g.ai/tx/0x64debb3d29793601b515baea9dab5e04a461dff8e019b0783e6894f3ca7d1555) |
| **commit** — sealed, direction private | [`0x16b4492e…`](https://chainscan.0g.ai/tx/0x16b4492ecfc41ae559a16fc109312bd3073f6666a8edda362b7d6ab22a0287c5) |
| **reveal (green)** — verified byte-exact | [`0xc8543dfc…`](https://chainscan.0g.ai/tx/0xc8543dfc0a44adced1c35bce3b5f336feaba8e31ff658a81f2eab0bd249ade19) |
| **tampered reveal (red)** — rejected | [`0x6d68ade3…`](https://chainscan.0g.ai/tx/0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b) |

The green and red are the **same slot**, one byte apart: the tampered reveal and
the honest reveal of slot 1. The commitment stayed sealed for **338 seconds**
after it landed, which is the window a renter is paying for.

Two details worth clicking through to. The red transaction **succeeded**; it carries a
`DecisionRejected(agent 8, slot 1, "BadReveal")` event, because a reverted transaction reads
like the system broke when what actually happened is the system worked. And the honest reveal
of that same slot landed afterwards, taking the epoch to **100% completeness**: the tamper was
caught and the record was not damaged, so a bad reveal cannot be used to grief an agent.

A commit past its deadline is rejected `SlotDeadlinePassed` and a reveal before the window
`RevealTooEarly`. Reproduce every one of these with `pnpm adversarial` in [`runtime/`](./runtime/).

### The run that went wrong

[Agent 7](https://fief.timjosh507.workers.dev/agents/7) is a 288-slot campaign at
a five-minute cadence. It committed 33 slots and then stopped, on 2026-08-25 at
20:32 UTC, because the machine running it went to sleep. The other **255 slots
are permanently Missed**, and the epoch sits at **10.76%**.

We cannot reopen it, backfill it or delete it. An operator can always abandon a
bad epoch and open a clean one, and Fief does not prevent that either. What it
does is list every epoch the agent ever opened, side by side, with lifetime
completeness across all of them. A fresh 100% has to be read next to whatever it
was started to escape.

This is the most useful thing in the repository. Everything else demonstrates
the mechanism working in our favour; this is it working against us, on mainnet,
where we cannot take it back.

The enclave key is read live: `RecordBook.expectedTeeSigner` returns `0xA46EA4FC…46B9` straight from 0G's `InferenceServing.getService`, with no admin pin set.

## The mechanism (one sentence)

The same sealed strategy said this, at this time, before the answer was known.

## 0G components used

| component | how Fief uses it |
|---|---|
| **0G Chain** (mainnet 16661) | timestamps the forward schedule, the sealed commits and the verified reveals |
| **0G Compute** (TeeML) | produces the attributable inference; its enclave key is recovered on-chain |
| **0G Storage** | holds the AES-256-GCM sealed strategy; its merkle root is the agent's `storageRoot` |
| **Agentic ID / ERC-8004** | identity and renter reputation, **testnet 16602 only** — the mainnet address is an ERC-1967 proxy whose reads all revert |

## Network

0G Mainnet — chainId **16661**, RPC `https://evmrpc.0g.ai`, explorer `https://chainscan.0g.ai`.

## Repo structure

| Path | What |
|---|---|
| **`internal/fief-prd-v2.md`** | **Current product requirements (verified 2026-08-25) — start here** |
| `docs/frontend-handoff.md` | Frontend build handoff (v1.1) |
| `web/` | Next.js (App Router) app — landing, proof, marketplace, agent record, dashboard, verify |
| `internal/fief-prd-v1.md` | Superseded by v2; kept for history |
| `internal/patch.md` | Architectural review that drove v2 |
| `contracts/` | Foundry: RecordBook, EpochBook, FiefAgent, RentalDesk, TeemlReceiptVerifier |
| `packages/reference/` | Executable reference model + fixtures the contract tests import |
| `runtime/` | Slot scheduler, decision loop, `pnpm showcase` / `pnpm adversarial` |
| `internal/seam/p0.2/` | Runnable spike proving the 0G Compute TEE-signature seam |
| `ARCHITECTURE.md` | Sequence diagram, contracts, 0G component map, honest limits |
| `SETUP.md` | Clean-clone reproduction; most of it needs no wallet |
| `contracts/SLITHER.md` | Audit triage: what was fixed, and why the rest are false positives |
| `CONTRIBUTING.md` | Workflow, branch/PR conventions, who-does-what |
| `DECISIONS.md` | Key decisions log |

## Independent verifier

A judge should not have to believe this frontend. `packages/verify` recomputes
everything from public chain data through a public RPC, including the full
byte-exact receipt check, by decoding the reveal transaction's own calldata.

```bash
cd packages/verify && pnpm install
pnpm start -- --agent 8 --epoch 0      # schedule, deadlines, completeness recount
pnpm start -- --tx 0xc8543dfc…         # one reveal, byte for byte
```

It does not trust the stored `teeSigner`: it recovers the signer from the
receipt and compares against what 0G's own `InferenceServing` contract says.

## Verify it yourself

No wallet needed for any of these.

```bash
# 242 tests from a clean clone
git clone https://github.com/winsznx/fief.git && cd fief
(cd packages/reference && pnpm install && pnpm verify)
(cd contracts && forge install foundry-rs/forge-std --no-git && forge test)
(cd web && pnpm install && pnpm verify)
(cd runtime && pnpm install && pnpm verify)

# The enclave key the contract will accept, read live from 0G's serving contract
cast call 0x40eB003340f467e096F8Ae30f8696bE40Eba922c \
  "expectedTeeSigner(address)(address)" 0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D \
  --rpc-url https://evmrpc.0g.ai
```

Full steps in [SETUP.md](./SETUP.md).

## What is not built

Fief today is a proof of mechanism on mainnet, not a service you can subscribe
to. The distinction matters, so here it is before the good parts.

- **Renters receive nothing.** There is no signal delivery. A renter can escrow
  on-chain and then has no way to be sent the cleartext, because no API, feed or
  route serves it. The payload exists only inside the operator's runtime
  process. What *is* proven is that a payload, once held, can be verified
  against the on-chain commitment before any reveal exists. Getting it to a
  renter is unbuilt, and it is the first thing that should be.
- **The operator runs a CLI.** `@fief/runtime` is unpublished, so running an
  agent means cloning this repo. The commit loop genuinely needs a long-lived
  process — it holds five-minute deadlines for 24 hours — but it should be a
  package or a hosted runner, not a git clone.
- **The web app reads; it barely writes.** Renting works from a browser wallet.
  Minting, resealing, listing, settling and audit grants all run through
  `runtime/` CLIs and deliberately throw in the console UI.
- **One agent is listed.** Agent 6. The other seven cannot be rented.
- **Inference fails about one slot in nine.** On the current campaign 5 slots
  were lost before their deadline: four to the 0G Compute provider returning
  `fetch failed`, one to `Missing or invalid parameters`. There is no retry
  inside the 120s commit deadline yet, and inference takes 30-40s, so there is
  room for one.
- **No stranger has used it.** The one rental was from a wallet we generated. It
  is a real second wallet, not the deployer, but it is not a third party.

The cryptographic limits are separate and live in [SECURITY.md](./SECURITY.md),
including the sharpest one: the strategy commitment is declared on the *response*
side, so an authorized request audit is what closes it today.

## Honest-status discipline

Fief never claims "trustless", "unextractable", or "impossible to fake". We state only what is proven: *strategy sealed on 0G Storage, decisions attested by 0G TeeML, committed on-chain before the market outcome and revealed and verified after, request commitment sealed and auditable under authorized access.* Agentic ID and ERC-8004 reputation data is always labelled **testnet**. Bytecode does exist at the canonical ERC-8004 address on mainnet, but it is an ERC-1967 proxy with no working implementation and every read reverts, so the registry is not usable there; on testnet the same address answers `name()` with `AgentIdentity`. Verified 2026-08-25. All UI copy must follow this rule (see the handoff and PRD §8).

## License

MIT — see [LICENSE](./LICENSE).
