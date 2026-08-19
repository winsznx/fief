# P0.2 — Compute seam spike

Proves the exact seam the on-chain `RecordBook` depends on, **before** any product code
(PRD §16 P0: "no product code; seam report in `/internal/`"). Lives under `/internal/`
(gitignored), so nothing here ships.

## What it asserts (the gate)

Against a live 0G Compute **TeeML** provider, end to end:

| # | Check | PRD gate |
|---|---|---|
| 1 | signed `text` is exactly **129 bytes** and `signing_algo == ecdsa` | §2 core claim |
| 2 | **no proxy mutation**: `sha256hex(reqBody):sha256hex(respData)` (our exact bytes) `== provider text` | **P0.2** (the last real unknown) |
| 3 | EIP-191 `recover(text, signature) == signing_address` | §2 core claim |
| 4 | `recover == getService(provider).teeSignerAddress` **and** `teeSignerAcknowledged == true`, read live on-chain | **P0.3** |
| 5 | **parse path**: build `EXP = "content":" + COMMIT_LINE` from state+args and byte-`memcmp` it inside `respData` at `commitOffset` | §5 (envelope parse) |

Checks 2–4 are the make-or-break P0.2/P0.3 gate. If they pass, P1 is green-lit. If check 2
fails, a canonicalization prober tries several serializations to pinpoint how the broker
normalized the request (turns a failure into an actionable fix, or the documented kill/pivot).

Check 5 is split: a **deterministic self-test** of the build-EXP + memcmp algorithm (HARD —
proves the Solidity parse logic, incl. decoy rejection and field-exact binding) plus a **live**
match against the real provider `respData` (**advisory** — depends on the model echoing
COMMIT_LINE verbatim and the provider's JSON style). The live pass emits `live_commitOffset`,
`live_anchor_bytes`, and `recordDecision_args_for_contract` so you can set the Solidity anchor
constant and wire the runtime call from real data.

## Prereqs

- **Node >= 22**
- A **funded wallet** private key (owner-provided per PRD; gas + the 3 OG ledger / 1 OG sub-account).
  Never commit it.

## Run

```bash
cd internal/seam/p0.2
npm install

# Mainnet (Wave 3 target)
NETWORK=mainnet PRIVATE_KEY=0xYOUR_KEY npm run seam

# Pre-approved narrowing if no mainnet TeeML provider is reachable:
NETWORK=testnet PRIVATE_KEY=0xYOUR_KEY npm run seam
```

Optional env:

- `PROVIDER=0x...` — pin a specific provider instead of auto-picking the first TeeML one.
- `MODEL=...` — pin a model id (multi-model providers).
- `RPC=...` — override the RPC URL.
- `LEDGER_OG=3`, `SUBACCOUNT_OG=1` — funding amounts (0G).
- COMMIT_LINE fields (canonical, must match the on-chain rebuild): `BOOK=0x..` (RecordBook addr; default zero-address until P4), `STRATEGY_H=0x..64`, `RENTER=0x..` (zero-address = no renter), `AGENT_ID`, `EPOCH`, `NONCE`.

## Output

- Console: step-by-step log ending in `RESULT: PASS` / `FAIL` (exit code 0/1).
- `report/report.json` — machine-readable checks + non-fatal observations.
- `report/request.json`, `report/response.json`, `report/signature.json` — raw artifacts
  (paste these into the `/internal/` seam report).

Secrets (private key, `Authorization` header) are never logged or written.

## Observations it records (feed contract design, non-fatal)

- **respData is the OpenAI JSON envelope**, so the `COMMIT_LINE` lands inside
  `choices[0].message.content`, **not** at offset 0 of the signed bytes. §5 (patched) handles
  this by rebuilding `EXP = "content":" + COMMIT_LINE` on-chain and byte-`memcmp`-ing it at a
  caller-supplied `commitOffset`. Check 5 proves that path; the report emits the exact
  `live_anchor_bytes` + `commitOffset` to lock the Solidity anchor constant. The COMMIT_LINE
  prefix is deliberately slash-free (`FIEFv1`), so the optional JSON `\/` escape cannot apply;
  if the provider pretty-prints (`"content": "`) the advisory check detects that anchor variant.
- The SDK's own `processResponse()` result, for contrast: it trusts the provider-returned
  `text` and only ecrecovers — it does **not** recompute the hashes. Our check 2 is strictly
  stronger, which is exactly Fief's headline claim.

## SDK facts pinned (verified 2026-08-19, `@0gfoundation/0g-compute-ts-sdk@0.9.0`)

- `createZGComputeNetworkBroker(wallet)` → `{ ledger, inference }` (auto-detects network).
- `broker.ledger.addLedger(3)` create; `transferFund(p,'inference', 1n*10n**18n)` sub-account.
- `broker.inference.listService()` returns acknowledged-only by default.
- `getServiceMetadata(p, model?)` → `{ endpoint, model }`; `getRequestHeaders(p)` → `{ Authorization }`.
- signature: `GET {endpoint}/signature/{chatID}?model={model}` → `{ text, signature, signing_address, signing_algo }`.
- `getService(address)` tuple field 10/11 = `teeSignerAddress` / `teeSignerAcknowledged`.
