# Fief

**Rent or buy a trading agent whose track record is signed by its own sealed brain — so the record can't be faked and the strategy never leaks.**

Fief is an AI × onchain marketplace on [0G](https://0g.ai). Every decision an agent makes comes back **TEE-signed by 0G Compute**, is **verified on-chain** against the agent's **sealed strategy commitment**, and lands in an **append-only record that travels with the agent's ERC-7857 token** when it is rented or sold. The strategy itself stays encrypted on 0G Storage — only hashes ever touch the public chain.

> **Status: pre-build.** The product is fully specified (see the PRD) and the critical 0G Compute signature seam is verified against source + a runnable spike. Frontend is handed off to [@JemIIahh](https://github.com/JemIIahh) — start at [`docs/frontend-handoff.md`](./docs/frontend-handoff.md). Contracts, runtime, and real 0G integration follow. Target: **0G Bridge by AKINDO, Wave 3.**

## The mechanism (one sentence)

Every decision comes back TEE-signed by 0G Compute, is verified on-chain against the agent's sealed strategy commitment, and is recorded in a ledger that travels with the token when the agent is rented or sold.

## Network

0G Mainnet — chainId **16661**, RPC `https://evmrpc.0g.ai`, explorer `https://chainscan.0g.ai`.

## Repo structure

| Path | What |
|---|---|
| **`docs/frontend-handoff.md`** | **Frontend build handoff — start here if you're building UI** |
| `web/` | Next.js (App Router) scaffold — pages land via PR |
| `internal/fief-prd-v1.md` | Full product requirements (internal; verified 2026-08-19) |
| `internal/seam/p0.2/` | Runnable spike proving the 0G Compute TEE-signature seam |
| `CONTRIBUTING.md` | Workflow, branch/PR conventions, who-does-what |
| `DECISIONS.md` | Key decisions log |

## Honest-status discipline

Fief never claims "trustless", "unextractable", or "impossible to fake". We state only what is proven: *strategy sealed on 0G Storage, decisions attested by 0G TeeML, request commitment sealed and auditable under authorized access.* All UI copy must follow this rule (see the handoff and PRD §8).

## License

MIT — see [LICENSE](./LICENSE).
