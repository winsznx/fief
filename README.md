# Fief

**A market for proof-carrying alpha. Rent private trading signals whose complete forward record is committed before the market moves and cryptographically tied to the sealed agent that produced them.**

Fief is an AI × onchain marketplace on [0G](https://0g.ai). An agent opens a **forward epoch** that fixes its market, cadence, horizon and deadlines before any outcome is knowable. At every scheduled slot it commits a **TEE-signed 0G Compute receipt** on-chain before the slot deadline. Renters get the cleartext signal immediately; the public sees only a sealed commitment. After the market horizon passes, the receipt is **revealed and verified byte-exact on-chain** against the agent's sealed strategy commitment. Every scheduled slot resolves publicly to Committed, Missed or Invalid, so the record is complete by construction and losing calls cannot be quietly deleted. The strategy itself stays encrypted on 0G Storage; only hashes touch the public chain.

**Live app: https://fief.timjosh507.workers.dev** — reads the record straight off 0G mainnet, no indexer, no wallet needed.

> **Status: live on 0G mainnet (chainId 16661).** A real forward epoch has run end to end: schedule fixed before any slot existed, every slot committed inside its deadline from a real TEE-signed 0G Compute inference, every slot revealed and verified byte-exact on-chain, completeness 100%. Contracts audited with Slither before deployment ([triage](./contracts/SLITHER.md)). Target: **0G Bridge by AKINDO, Wave 3.**

## Live on 0G mainnet

| contract | address |
|---|---|
| RecordBook | [`0x40eB003340f467e096F8Ae30f8696bE40Eba922c`](https://chainscan.0g.ai/address/0x40eB003340f467e096F8Ae30f8696bE40Eba922c) |
| EpochBook | [`0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8`](https://chainscan.0g.ai/address/0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8) |
| FiefAgent | [`0x4db74faF047160893Aa0dabC9A1B8F3297570a68`](https://chainscan.0g.ai/address/0x4db74faF047160893Aa0dabC9A1B8F3297570a68) |
| RentalDesk | [`0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57`](https://chainscan.0g.ai/address/0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57) |

The canonical run (agent 5, epoch 0), all on mainnet:

| step | tx |
|---|---|
| sealed strategy uploaded to **0G Storage** | [`0x8140d9b2…`](https://chainscan.0g.ai/tx/0x8140d9b27b01eb3af8b5a5ac31ef0fbb0d9efdf3aca964b01eb220436ca53677) |
| agent registered with `H` + `storageRoot` | [`0x0b851c43…`](https://chainscan.0g.ai/tx/0x0b851c43676ff440c611ba7f8700e1f44bb0f059a06e28eeda32e20cd266c53f) |
| forward epoch opened, schedule fixed | [`0x7fc60c5c…`](https://chainscan.0g.ai/tx/0x7fc60c5c6db8d82605f4168b4c14f412d416272dc2d6b14c681518d9291d0527) |
| **commit** — sealed, direction private | [`0xb1cf572f…`](https://chainscan.0g.ai/tx/0xb1cf572f94cb2404a7781f207b21883a5a444b5387d563b2e34ca5ad83f20cdb) |
| **reveal (green)** — verified byte-exact | [`0xdecf4eed…`](https://chainscan.0g.ai/tx/0xdecf4eed72087b518ae9212f0774a070a8776d303ff0f96e0e04aa96e3fffe98) |
| **tampered reveal (red)** — rejected | [`0x3f12f574…`](https://chainscan.0g.ai/tx/0x3f12f57405b597001e18dc75d0f21d86c6d712bf9726db74d0b320046bf04f8c) |
| honest reveal of that same slot | [`0x210d4317…`](https://chainscan.0g.ai/tx/0x210d43176b9a950d21b16c778af1de419a62e4f4da1bc21239433b9f63a4e21c) |

Two details worth clicking through to. The red transaction **succeeded**; it carries a
`DecisionRejected(agent 5, slot 1, "BadReveal")` event, because a reverted transaction reads
like the system broke when what actually happened is the system worked. And the honest reveal
of that same slot landed afterwards, taking the epoch to **100% completeness**: the tamper was
caught and the record was not damaged, so a bad reveal cannot be used to grief an agent.

A commit past its deadline is rejected `SlotDeadlinePassed` and a reveal before the window
`RevealTooEarly`. Reproduce every one of these with `pnpm adversarial` in [`runtime/`](./runtime/).

The enclave key is read live: `RecordBook.expectedTeeSigner` returns `0xA46EA4FC…46B9` straight from 0G's `InferenceServing.getService`, with no admin pin set.

## The mechanism (one sentence)

The same sealed strategy said this, at this time, before the answer was known.

## 0G components used

| component | how Fief uses it |
|---|---|
| **0G Chain** (mainnet 16661) | timestamps the forward schedule, the sealed commits and the verified reveals |
| **0G Compute** (TeeML) | produces the attributable inference; its enclave key is recovered on-chain |
| **0G Storage** | holds the AES-256-GCM sealed strategy; its merkle root is the agent's `storageRoot` |
| **Agentic ID / ERC-8004** | identity and renter reputation, **testnet only** — no mainnet deployment exists upstream |

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
pnpm start -- --agent 5 --epoch 0      # schedule, deadlines, completeness recount
pnpm start -- --tx 0xdecf4eed…         # one reveal, byte for byte
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

## Honest-status discipline

Fief never claims "trustless", "unextractable", or "impossible to fake". We state only what is proven: *strategy sealed on 0G Storage, decisions attested by 0G TeeML, committed on-chain before the market outcome and revealed and verified after, request commitment sealed and auditable under authorized access.* Agentic ID and ERC-8004 reputation data is always labelled **testnet**, because no mainnet deployment of those registries exists upstream. All UI copy must follow this rule (see the handoff and PRD §8).

## License

MIT — see [LICENSE](./LICENSE).
