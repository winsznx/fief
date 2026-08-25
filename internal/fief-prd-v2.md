# FIEF - Product Requirements Document v2

Supersedes `fief-prd-v1.md` (kept for history). v2 absorbs the architectural review in `internal/patch.md` in full, after a second source-verification pass on 2026-08-25.

The change in one line: v1 proved *provenance* (this output came from that sealed brain). v2 proves *prospective completeness* (and it was committed before the answer was knowable, and nothing was quietly dropped), and it stops giving the alpha away for free.

---

## 0. Provenance and evidence levels

Every factual row is tagged: **SRC** (read from source or on-chain), **DOC** (official docs), **EXEC** (must be executed live to be true). No row is promoted without evidence. Unresolved items say UNKNOWN rather than guessing.

## 0.5 Inherited verification pass - 2026-08-19

All of v1 §0.5 carries forward unchanged and is not restated. Its seven corrections (license is MIT not GPL-3.0; `authorizeUsage` 2-arg; `mint` proofs are 32-byte elements; `transfer` has no explicit sealedKey; the draft verifier is a no-op on both paths; storage SDK deprecated and non-encrypting; respData is an OpenAI envelope so the commit line is not at offset 0) all still hold as statements about the pinned `eip-7857-draft` branch.

What changed is that v2 stops depending on that branch. See §0.6 item 3.

## 0.6 Verification pass - 2026-08-25 (v2 gate resolutions)

Re-verified live against npm, the packaged SDK type definitions, and 0G mainnet RPC.

| # | Finding | Level | Consequence |
|---|---|---|---|
| 1 | `@0glabs/0g-ts-sdk@0.3.3` is deprecated on npm, last published 2026-04-30. `@0gfoundation/0g-storage-ts-sdk@1.2.11` (ISC) is live, published 2026-08-11, and ships `file/EncryptedFile`, `file/MerkleTree`, `transfer/Uploader`, `transfer/Downloader`, `kv/*` | SRC (npm + package tree) | **P0.4 is deleted as a gate.** Adopt the maintained package. Nothing left to prove about a dead one |
| 2 | `@0gfoundation/0g-agenticid-sdk@0.1.2` exists (published 2026-08-14) and is substantial: `AgenticID` facade with `agent` + `reputation` namespaces, `ServeProof`, `ReputationClient`, `AttestorClient`, `SandboxClient`, `TransferValidityProof` = `AccessProof` + `OwnershipProof` (both carrying `nonce` + `deadline`) | SRC (dist/*.d.ts) | Real, and materially better than the draft fork. Adopted for identity + reputation |
| 3 | **Agentic ID has no mainnet deployment.** `constants.d.ts` on `ZERO_G_MAINNET`: "NOTE: AgenticID is testnet-only today - no mainnet contract deployment exists yet; this is here for when the protocol goes to mainnet." Contract addresses are not baked into the SDK at all; they are a per-deployment artifact | SRC (constants.d.ts) | **Corrects patch.md.** ERC-7857/8004 cannot carry the Wave 3 mainnet requirement. Fief's own contracts go to mainnet; Agentic ID + ERC-8004 run on testnet 16602 and are labelled testnet everywhere |
| 4 | `ServeProof` = `{ agentId, submitter, timestamp, deadline, taskHash, dataHashes[], frameworkHash, signature }`. Signature is EIP-191 over `keccak256(abi.encode(chainid, identityRegistry, submitter, agentId, timestamp, deadline, taskHash, keccak256(abi.encodePacked(dataHashes)), frameworkHash))`, signed by `agentSeal`. `submitter` is declared to the TEE via the `X-Client-Address` request header and bound into the signature | SRC (ServeProof.d.ts) | Gives Fief a renter-bound, deadline-bound serve credential for free. Used for the ERC-8004 feedback gate |
| 5 | `giveFeedback` requires a `ServeProof` and the SDK comments it as "the 'I was actually served' credential; never optional". Feedback is attributed by `msg.sender` at submission | SRC (types.d.ts) | Renter reputation is provably earned, not spoofable. Satisfies patch.md item 5 |
| 6 | **Compute funding is already resolved.** Operator wallet `0xbF7EF900E2dB365455B91Fb133f78Fc70114Bf31` has a Compute ledger on mainnet: `totalBalance` 9.4545 OG, `availableBalance` 0.1 OG. `LedgerManager.MIN_ACCOUNT_BALANCE()` = 3 OG (creation minimum, already cleared). Wallet gas balance 0.9814 OG mainnet, 0 testnet | SRC (mainnet eth_call, ledger `0x2dE5...74E3`) | **P0.1 is closed, not merely relaxed.** ~9.35 OG is already committed to provider sub-accounts. P0.2 is runnable immediately. Testnet needs a faucet top-up before P0.5 |
| 7 | The `deadline` field on both `ServeProof` and the transfer proofs shows 0G's own model treats attestations as time-bounded | SRC | Confirms the v2 slot-deadline design is idiomatic, not a Fief invention |

Two v1 claims are now retired: "P0.4 must confirm the deprecated SDK still round-trips" (moot, swapped) and "mainnet OG is owner-funded, just fund the ledger" (already funded).

### 0.6.1 P0.2 / P0.3 executed live on mainnet - 2026-08-25 - GREEN

The seam spike at `internal/seam/p0.2/` was run against 0G **mainnet** 16661. **All hard checks passed with zero advisories.** This clears the only remaining kill trigger for the core mechanism.

| Check | Result |
|---|---|
| signed text length == 129 | PASS |
| `signing_algo == ecdsa` | PASS |
| **no proxy mutation: `sha256(reqBody):sha256(respData)` == provider `text`** | **PASS** |
| recovered signer == returned `signing_address` | PASS |
| on-chain `teeSignerAcknowledged == true` | PASS |
| ABI sanity: on-chain signer == SDK `checkProviderSignerStatus` | PASS |
| **recovered signer == `getService(provider).teeSignerAddress`** | **PASS (P0.3 live)** |
| selftest: EXP located, memcmp parity, decoy `"content"` skipped | PASS |
| **live: EXP found + byte memcmp OK at `commitOffset`** | **PASS** |

Live values, now SRC facts:

- Working provider: **`0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D`, model `glm-5.2`**, endpoint `https://compute-network-19.integratenetwork.work/v1/proxy`.
- TEE signer: **`0xA46EA4FC5889AD35A1487e1Ed04dCcfa872146B9`**, acknowledged on-chain.
- **`live_anchor_bytes` = `"content":"`** (compact, no space). The v1/v2 anchor assumption is confirmed against a live provider, not assumed.
- `live_commitOffset` = 95, `EXP_length_bytes` = 300.
- **The model echoed COMMIT_LINE verbatim at the head of `choices[0].message.content`**, so the §5 output contract is achievable in practice.

Operational facts learned in the run, all worth keeping:

1. **6 of 23 acknowledged mainnet services are TeeML/decentralized**: `whisper-large-v3`, `z-image-turbo`, `openai/gpt-5.4-mini`, `glm-5.2`, `0GM-1.0-35B-A3B`, `0GM-1.0-35B-A3B-SIA`. Only the last four are chat models. The "no TeeML provider reachable" kill trigger is retired.
2. **`openai/gpt-5.4-mini` (`0x25F8f01c…Ca497`) is broken**, not underfunded: it returns HTTP 502 `{"type":"zktls_error","code":50003}` deterministically (identical response hash across runs) with a 1.4814 OG funded sub-account. Do not pin it. Provider health is a live variable, so the runtime must pin a *set* and fail over.
3. **Reasoning models need real token headroom.** At `max_tokens: 256` glm-5.2 returned `finish_reason: length` with one character of content, because reasoning tokens consumed the budget. This looked exactly like a model-compliance failure and was not. The spike now defaults to 4096. **The runtime must treat `finish_reason != "stop"` as a slot failure**, never as a decision.
4. **`getProvidersWithBalance()` is the honest view of ledger allocation.** A hand-rolled `InferenceServing.getAccount` ABI misdecoded the balance by two orders of magnitude. Use the SDK's accessor, never a guessed struct shape.
5. Funds were reclaimed from two idle sub-accounts to unblock the run (`0x4897b1fd…`, `0x5149e66a…`), moving ledger available from 0.1 to 5.97 OG. Sub-account funding for the working provider: `0xb2e72566…`.

**Remaining before Solidity is frozen:** the spike still emits the v1 commit line (`nonce:<n>`). v2 replaces that field with `slot:<k>` (§4.3). The shape, widths and JSON-safety are unchanged, so the proof carries over, but re-run the spike with the v2 line to re-confirm `EXP_length_bytes` before pinning any constant in `RecordBook`.

---

## 1. Product definition

One sentence: **Fief is a market for proof-carrying alpha. Rent private trading signals whose complete forward record is committed before the market moves and cryptographically tied to the sealed agent that produced them.**

The sentence a judge must remember: *the same sealed strategy said this, at this time, before the answer was known.*

Thesis: a track record is only trustworthy when three things hold at once. It is cryptographically inseparable from the exact intelligence that produced it (v1 solved this). It was committed prospectively, before outcomes were knowable (v2 solves this). It is complete, so the operator cannot silently delete losing calls (v2 solves this). 0G is the only stack where all three are buildable today: TeeML-signed inference on 0G Compute, sealed availability on 0G Storage, settlement and timestamping on 0G Chain, and transferable encrypted intelligence plus portable reputation via Agentic ID and ERC-8004.

First user: a buyer of trading signals who today chooses between fabricated backtests and blind trust in an operator. Second user: a strategy author who wants to monetize without disclosure. First listed agents are the owner's existing live agents (Delphi arena, OKX), giving real records from day one.

Single verb: **rent**. The renter receives live, provenance-verified decisions while they still have value. Execution stays with the renter; Fief never trades on their behalf.

Decision domain v1: short-horizon BTC direction calls (UP / DOWN / FLAT plus confidence and size hint) against canonical OKX market snapshots. The mechanism is domain-agnostic; this domain is chosen because records accrue fast and outcomes are objective.

### 1.1 Why this is not Zero Arena or NEXUS

| Product | Main mechanism |
|---|---|
| Zero Arena | prove trading agents through competitive live seasons |
| NEXUS | general proof and reputation layer for AI agents |
| **Fief** | **sell private live alpha with pre-outcome commitment and post-outcome cryptographic proof** |

The differentiator is the commit/reveal economics (§4.2), not the receipt verification. Anyone can verify a TEE signature. Fief is the only one where the signal stays private while it is worth money and becomes publicly verifiable once it is not.

---

## 2. Dominant mechanism, falsifiable claim, headline proof

**Dominant mechanism.** An agent opens a forward epoch that fixes its market, cadence, horizon and deadlines before any outcome is known. At every scheduled slot it commits a sealed 0G Compute TeeML receipt on-chain before the slot deadline. Renters receive the cleartext signal immediately. After the market horizon passes, the receipt is revealed and verified byte-exact on-chain against the sealed strategy commitment. Every scheduled slot resolves publicly to Committed, Missed or Invalid, so the record is complete by construction.

**Falsifiable core claim (v2, exact wording).** Given agent N with sealed strategy hash H in forward epoch E, whose spec (market, cadence, horizon, start, slot count, max commit delay) was fixed on 0G mainnet at block time T0 before any slot snapshot time: every Revealed entry carries an ECDSA signature over `sha256(request):sha256(response)`, recovered on-chain to the TEE signer registered in 0G's inference serving contract, where the response bytes hashed on-chain contain the commitment line naming N, H, E, the slot index, and the input hash; every such entry was committed on-chain before its slot's commit deadline; and every slot in E's schedule resolves to exactly one of Committed, Missed or Invalid, with no slot unaccounted.

**Falsified by any of:** a receipt signed by a key other than the registered TEE signer being Accepted; a commit landing after its slot deadline being Accepted; a reveal whose bytes do not match the earlier commitment being Accepted; a response whose commitment line names a different agent, hash, epoch or slot being Accepted; a slot in a sealed epoch resolving to no terminal state; a record entry surviving a strategy swap into a new epoch; the contract accepting a reveal whose respData does not hash to the signed text.

Note what v2 adds over v1: the last three clauses of the claim and the entire second clause did not exist in v1, and they are exactly what closes the omission attack.

**Headline proof.** A completeness bar plus three transactions on ChainScan:
1. **Commit (green, early)** - a sealed commitment landing at block time strictly before the market outcome was resolvable. Camera on the timestamp.
2. **Reveal (green)** - the same slot opened after the horizon, byte-exact verified, showing what the sealed brain actually said.
3. **Two reds** - a reveal with one tampered byte, rejected; and a commit submitted past its slot deadline, rejected.

Plus the epoch summary: `N expected / N committed / M revealed / 0 missing / 0 backfilled`.

---

## 3. Verified platform facts (constants file, do not re-derive)

| Item | Value | Level |
|---|---|---|
| Mainnet chain ID | 16661 | SRC |
| Mainnet RPC | https://evmrpc.0g.ai | DOC + SRC |
| Testnet chain ID / RPC | 16602 / https://evmrpc-testnet.0g.ai | SRC |
| Explorer | https://chainscan.0g.ai (storage: storagescan.0g.ai) | DOC |
| Inference serving contract (mainnet) | 0x47340d900bdFec2BD393c626E12ea0656F938d84 | SRC |
| Ledger contract (mainnet) | 0x2dE54c845Cd948B72D2e32e39586fe89607074E3 | SRC |
| Fine-tuning contract (mainnet) | 0x4e3474095518883744ddf135b7E0A23301c7F9c0 | SRC |
| Inference serving contract (testnet) | 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E | SRC |
| Compute SDK | @0gfoundation/0g-compute-ts-sdk v0.9.0, Node >= 22 | SRC + DOC |
| **Storage SDK (v2)** | **@0gfoundation/0g-storage-ts-sdk v1.2.11 (ISC), maintained, published 2026-08-11.** Modules: `file/{ZgFile, MemData, Blob, EncryptedFile, MerkleTree}`, `transfer/{Uploader, Downloader}`, `kv/*`. Replaces the deprecated `@0glabs/0g-ts-sdk@0.3.3` | SRC (npm + package tree, 2026-08-25) |
| **Agentic ID SDK** | **@0gfoundation/0g-agenticid-sdk v0.1.2, published 2026-08-14.** Facade `AgenticID({ addresses, account })`; namespaces `agent` (deploy/clone/transfer/reads) + `reputation` (serve-proof/feedback); top-level `ack`/`ackStatus`/`deposit`/`getBalance` | SRC (dist/index.d.ts) |
| **Agentic ID network availability** | **TESTNET ONLY.** SDK `constants.d.ts` states no mainnet deployment exists. Addresses are not bundled; supply `{ agenticID, teeDataVerifier, reputationRegistry, tappRegistry, sandboxServing }` from the deployment artifact | SRC (constants.d.ts, 2026-08-25) |
| **ServeProof struct** | `{ agentId, submitter, timestamp, deadline, taskHash, dataHashes[], frameworkHash, signature }`. Digest = EIP-191 over `keccak256(abi.encode(chainid, identityRegistry, submitter, agentId, timestamp, deadline, taskHash, keccak256(abi.encodePacked(dataHashes)), frameworkHash))`, signed by `agentSeal`. Sign the digest **raw** (`account.sign({hash})`); `signMessage({message:{raw}})` double-wraps EIP-191 and fails verification | SRC (ServeProof.d.ts) |
| **Operator wallet** | 0xbF7EF900E2dB365455B91Fb133f78Fc70114Bf31. Mainnet gas 0.9814 OG; Compute ledger exists: total 9.4545 OG, available 0.1 OG. Testnet 0 OG (faucet needed for P0.5) | SRC (mainnet RPC, 2026-08-25) |
| Signed receipt text | `sha256hex(reqBody) + ":" + sha256hex(respData)`, lowercase hex, 129 ASCII bytes. On-chain EIP-191 prefix = `"\x19Ethereum Signed Message:\n129"` | SRC (signing.go) |
| Signature scheme | ECDSA over EIP-191 personal-message hash, v normalized to 27/28 | SRC |
| Receipt retrieval | `GET {providerBrokerURL}/v1/proxy/signature/{chatID}?model={model}` returns `{text, signature, signing_address, signing_algo}` | SRC |
| chatID source | `ZG-Res-Key` response header, fallback `data.id` | DOC + SRC |
| TEE signer on-chain read | `InferenceServing.getService(address)` returns `Service{..., teeSignerAddress, teeSignerAcknowledged}`. Read live via staticcall. Separated-decentralized providers override via off-chain `additionalInfo.TargetTeeAddress` | SRC |
| Verification modes | TeeML (model inside TEE) and TeeTLS (broker proxies a centralized LLM). v1 and v2 pin TeeML only | DOC |
| Ledger minimums | `MIN_ACCOUNT_BALANCE()` = 3 OG to create a ledger, 1 OG per provider sub-account. **Already satisfied, see operator wallet row** | SRC (mainnet call) |
| Rate limits | 30 req/min, burst 5, 5 concurrent, per user per provider | DOC |
| ERC-7857 draft reference | github.com/0gfoundation/0g-agent-nft @ `eip-7857-draft`. **v2 does not fork it.** Retained only as the documented upstream-contribution target (§15) | SRC |
| Draft verifier caveat | `verifyPreimage` hardcodes `isValid=true` after a 32-byte length check; `verifyTransferValidity` checks only a receiver ECDSA sig + replay nonce, TEE/ZKP proof is a `// TODO` stub, `attestationContract` never read. Fief claims zero security from it and no longer depends on it | SRC |
| License | Fief code MIT. No GPL-3.0 interface is vendored in v2 (the fork is dropped), so the package is uniformly MIT | SRC |
| Hackathon | Wave 3 needs a 0G **mainnet** contract + explorer activity; Compute/DA may stay testnet; public repo with wave-period commits; video <= 3 min; mandatory X post `#0GBridge #BuildOn0G` tagging `@0G_labs @0G_Builders @AKINDO_io`; judging progress 40 / integration 30 / quality 20 / traction 10 | Brief |
| Wave 3 deadline | 2026-08-30 16:00 submit (a later 2026-09-10 16:00 date is judging/grace). Wave 4: 2026-09-20 16:00 | DOC |

---

## 4. Architecture

Components:

1. **contracts/** (0G mainnet 16661, Solidity 0.8.2x, Foundry)
   - `FiefAgent` - **own minimal MIT contract, not a fork.** Ownership, operator registry, strategy commitment `H` per epoch, epoch counter. The draft fork bought nothing: its verifier is a no-op, its `authorizeUsage` lacks permissions, and it is GPL-entangled at the interface. Writing ~150 lines of our own is smaller, safer and uniformly MIT.
   - `EpochBook` - forward epoch registry. Fixes the slot schedule before any outcome is knowable. The contract that makes the completeness claim true.
   - `RecordBook` - commit/reveal decision lifecycle and the byte-exact receipt verification. The core contract.
   - `RentalDesk` - listings, escrow, epoch-bound grants, per-slot settlement, 200 bps protocol fee.
   - `TeemlReceiptVerifier` - stateless library, on-chain verification of 0G TeeML receipts. Reusable, upstream-contribution target. **Kept verbatim from v1; it is the best piece and patch.md agrees.**
2. **runtime/** (Node 22, TypeScript, VPS). Holds the decrypted strategy in memory only. Runs the slot scheduler, builds canonical requests, calls 0G Compute, retrieves and locally verifies signatures, commits before the deadline, serves the authenticated renter feed, reveals after the horizon, issues ServeProofs.
3. **packages/reference/** - executable TypeScript reference model. Specification until execution disproves it.
4. **packages/verify/** - read-only CLI. `fief verify --agent N --epoch E` reconstructs epoch completeness, verifies receipt signatures, checks reveal-vs-commit hashes, verifies strategy-version binding, and recomputes performance from public evidence. A judge must never need the frontend to believe us.
5. **web/** (Next.js on Cloudflare Pages). Shipped and merged as of 2026-08-24 (PR #1).
6. **identity/** (0G **testnet** 16602) - Agentic ID registration, sealed iData, agentSeal, and the ERC-8004 ReputationRegistry feedback loop.
7. **storage adapter** - encrypted strategy blob and input snapshots to 0G Storage via `@0gfoundation/0g-storage-ts-sdk`.

### 4.1 Why identity is on testnet and the record is on mainnet

Agentic ID has no mainnet deployment (§0.6 item 3), and Wave 3 requires a mainnet contract with explorer activity. Fief therefore splits deliberately:

| Layer | Network | Rationale |
|---|---|---|
| EpochBook, RecordBook, RentalDesk, FiefAgent, TeemlReceiptVerifier | **mainnet 16661** | Fief's own Solidity. Satisfies the Wave 3 requirement. The record, the money and the proof all live here |
| 0G Compute TeeML inference | mainnet | Ledger already funded (§0.6 item 6) |
| 0G Storage sealed blobs | mainnet | Maintained SDK |
| Agentic ID (ERC-7857) identity, ERC-8004 reputation | **testnet 16602** | No mainnet deployment exists upstream |

Binding across the split: `FiefAgent` stores an optional `agenticIdRef = (chainId, registry, tokenId)` per agent, and the Agentic ID metadata carries the mainnet `(chainId, FiefAgent, agentId)`. Both directions are public and checkable. When Agentic ID ships to mainnet the binding migrates with one transaction and the record is untouched, because `RecordBook` is keyed by the Fief agent id, not by the NFT.

Every surface that shows Agentic ID or reputation data must label it **testnet**. This is a §8 copy rule, not a preference.

### 4.2 The commit/reveal lifecycle (the economic fix)

v1 put `respData` in public calldata at decision time, reasoning that "it is the decision, so it is public by design". That reasoning destroys the business: if UP/DOWN/FLAT is public the instant the inference happens, nobody rents anything, they just watch `RecordBook`. v2 restructures around **private alpha now, public proof later**.

```
                    t0                t_snap        t_commit_deadline    t_reveal_open
epoch spec fixed ----|                   |                  |                  |
                     |                   |                  |                  |
                                    snapshot taken          |                  |
                                    inference runs          |                  |
                                    receipt obtained        |                  |
                                    renter gets CLEARTEXT   |                  |
                                         + receipt          |                  |
                                    commitDecision() -------|                  |
                                    (sealed, public)                           |
                                                                     revealDecision()
                                                                     byte-exact verify
                                                                     outcome scored
```

- **At commit**: the chain learns that agent N, epoch E, slot k produced *some* decision, from provider P, with request hash `reqSha`, response hash `respSha`, and receipt commitment `receiptCommit`. It learns nothing about direction. This is cheap and must beat the slot deadline.
- **In parallel**: the renter receives the cleartext decision and the full receipt over the authenticated feed, and can verify it locally against the on-chain commitment immediately. They are paying for time advantage plus provenance.
- **At reveal** (after `t_snap + horizon + disclosureDelay`): anyone submits the plaintext. The contract runs the full v1 verification and additionally binds it to the earlier commitment. The decision becomes public, the outcome is scored, and the completeness counter advances.

Consequences: authors monetize proprietary alpha without publishing the strategy or giving away live calls; renters pay for a real edge; the delayed public record becomes the author's acquisition channel; every new paid inference is more 0G Compute usage.

### 4.3 Data flow, one slot

```
slot k of epoch E is due at t_snap = E.startTime + k * E.cadenceSeconds
snapshot(OKX at t_snap) -> inputHash = sha256(canonical snapshot)
runtime builds reqBody = COMMIT_LINE || strategyPrompt || snapshot   (canonical bytes)
  COMMIT_LINE = "FIEFv1|book:<RecordBook 0x..40>|chain:16661|agent:<id>|epoch:<E>|slot:<k>"
                "|strategy:<H 0x..64>|input:<inputHash 0x..64>|renter:<0x..40, zero-address if none>"
  (JSON-string-safe: no quotes, backslashes, control chars, and no "/" so the optional JSON \/
   escape cannot apply; canonical fixed-width fields; renter is a full 42-char address, never "0x0")
runtime -> 0G provider (Direct path, auth headers from broker SDK)
model output contract: message content MUST begin with the same COMMIT_LINE, newline, decision JSON
runtime GETs {endpoint}/signature/{chatID}?model={model} -> {text, signature, signing_address}
runtime local check: sha256(reqBody):sha256(respData) == text (129 bytes),
                     recover == getService(provider).teeSignerAddress
runtime computes commitOffset = byte index in respData of the `"content":"` preceding the echo
salt = 32 random bytes
receiptCommit = keccak256(abi.encode(respData, sig, commitOffset, inputHash, renter, salt))

--- PRIVATE PHASE ---
tx1: RecordBook.commitDecision(agentId, E, k, reqSha, respSha, receiptCommit, provider)
     contract: require block.timestamp <= slotCommitDeadline(E, k)   <-- the freshness gate v1 lacked
               require slot k not already committed
               store Commit{reqSha, respSha, receiptCommit, provider, committedAt}
               emit DecisionCommitted(agentId, E, k)
renter feed: { slot k, decision cleartext, respData, sig, commitOffset, salt, tx1 }
             renter verifies locally: keccak(...) == on-chain receiptCommit, and the TEE signature

--- PUBLIC PHASE, after t_snap + horizon + disclosureDelay ---
tx2: RecordBook.revealDecision(agentId, E, k, respData, sig, commitOffset, inputHash, renter, salt)
     contract: require block.timestamp >= slotRevealOpen(E, k)
               require keccak256(abi.encode(respData, sig, commitOffset, inputHash, renter, salt))
                       == stored receiptCommit                      <-- binds reveal to commit
               respSha = sha256(respData) (precompile); require == stored respSha
               text = hex(reqSha) ":" hex(respSha), exactly 129 ASCII bytes
               digest = EIP-191(text); signer = ecrecover(digest, sig)
               require signer == getService(provider).teeSignerAddress
                       && getService(provider).teeSignerAcknowledged
               EXP = `"content":"` || COMMIT_LINE rebuilt from on-chain state + (inputHash, renter)
               require respData[commitOffset .. +EXP.len] == EXP
               mark slot Revealed; store Entry; emit DecisionRevealed
```

The reveal is permissionless. Anyone holding the plaintext can reveal, including a renter. An owner who refuses to reveal does not hide the slot; it stays publicly Committed-but-unrevealed and is reported as such (§7 I13).

---

## 4.4 The binding construction and its honest limits

The TEE signature binds `sha256(reqBody)` and `sha256(respData)`. The request contains the secret strategy, so `reqBody` is never published; only `reqSha` goes on-chain.

Public binding rides on the response. `respData` is the provider's OpenAI-style JSON envelope, so the commitment is not at offset 0; the contract builds the expected bytes from its own state and asserts they appear at the head of `choices[0].message.content`, immediately after the `"content":"` anchor. `commitOffset` and the anchor are untrusted inputs; security rests entirely on the `EXP` memcmp, because `EXP` is derived from on-chain state and cannot be forged into a TEE-signed response.

**Closed in v2: the selective omission attack.** v1 §10 stated that a decision could be "discarded before nonce consumption (nonce assigned at successful signature fetch, not at request time)" and that there was "no on-chain freshness requirement in v1, nonce ordering suffices". Together those let a dishonest owner run four inferences, see which two were wrong, publish only the winners, and leave a record that is fully authentic and fully misleading. v2 closes it: the slot schedule is fixed before any outcome is knowable, every slot has an on-chain commit deadline, and every scheduled slot resolves to a terminal state. A dropped call is now permanently visible as `Missed` and lowers the published completeness. This is why v2 can say "the record cannot be quietly edited" where v1 could only say "each published entry is authentic".

**Still open, stated plainly and never hidden:**

1. **Response-side declaration.** The echoed commitment is produced by the model following the output contract. A dishonest owner could run a request that does not contain strategy H yet instructs the model to echo H. Remedies: the authorized request audit below, and the ZK prefix opening on the roadmap.
2. **Authorized request audit (ships v1 of v2).** A prospective buyer granted access recomputes `sha256(reqBody)` for any past slot, confirms it equals the on-chain `reqSha`, and confirms the body embeds H. Verification without public leakage. Pre-purchase due diligence becomes a product feature.
3. **ZK prefix opening (roadmap).** A SHA-256 partial-preimage proof that `reqBody` begins with COMMIT_LINE and contains H, without revealing the strategy. Removes limit 1 entirely.
4. **Completeness is per-epoch, not lifetime.** An author can abandon a bad epoch and open a fresh one. The record shows every epoch ever opened, including abandoned ones, and the UI ranks by lifetime completeness across epochs. This makes epoch-shopping visible rather than impossible.
5. **Renter distillation.** A renter observing many decisions can approximate the strategy. Mitigated by rate limits and the disclosure delay, documented as residual, not denied.

**Stronger than the reference SDK** (SRC, unchanged from v1 and still true): 0G's own `processResponse` does not recompute the hashes; it trusts the provider-returned `text` and only ecrecovers it. `RecordBook` recomputes `sha256(respData)` on-chain and rebuilds the 129-byte text before ecrecover, so a provider returning a `text` that does not match the actual bytes passes the SDK and fails Fief.

---

## 5. Contract specification

### FiefAgent (mainnet, own MIT contract)
- `register(bytes32 H, bytes32 storageRoot, string domain) -> agentId` - mints a Fief agent. `H = keccak256(canonical strategy JSON)`, `storageRoot` = 0G Storage merkle root of the AES-256-GCM blob.
- `setOperator(agentId, address)` - owner-only. Operator is the runtime EOA allowed to commit and reveal. `OperatorChanged` event. Key compromise recovery is operator rotation; epochs are unaffected.
- `setAgenticIdRef(agentId, uint64 chainId, address registry, uint256 tokenId)` - owner-only, links the testnet Agentic ID token (§4.1). Advisory metadata; no Fief security depends on it.
- `transferAgent(agentId, to)` - ownership moves, record does not. `RecordBook` is keyed by `agentId`.
- No ERC-7857 fork, no GPL-3.0 vendored interface, no permissive external verifier.

### EpochBook (mainnet) - the completeness contract
```solidity
struct EpochSpec {
    bytes32 market;              // e.g. keccak("BTC-USDT")
    uint32  cadenceSeconds;      // slot spacing
    uint32  horizonSeconds;      // evaluation horizon per slot
    uint32  maxCommitDelay;      // commit deadline offset from snapshot time
    uint32  disclosureDelay;     // reveal opens at snap + horizon + this
    uint64  startTime;           // first slot snapshot time
    uint32  slotCount;           // total scheduled slots
    bytes32 strategyHash;        // H for this epoch
    bytes32 providerSetHash;     // keccak of the sorted pinned provider list
}
```
- `openEpoch(agentId, EpochSpec spec) -> epochId` - owner-only. **Requires `spec.startTime >= block.timestamp`**, so no epoch can be opened over a window whose outcomes are already known. Emits `EpochOpened(agentId, epochId, keccak256(abi.encode(spec)))`. The spec is immutable once opened.
- Derived, pure, no storage: `slotSnapshotTime(E,k) = startTime + k*cadence`; `slotCommitDeadline(E,k) = slotSnapshotTime + maxCommitDelay`; `slotRevealOpen(E,k) = slotSnapshotTime + horizon + disclosureDelay`; `epochEnd(E) = slotCommitDeadline(E, slotCount-1)`.
- `finalizeEpoch(agentId, epochId)` - permissionless, callable after `epochEnd`. Writes the immutable summary `{committed, revealed, missed, invalid}` once. Missed is derived, not stored per slot: a slot with no commit past its deadline **is** Missed, computable by any reader with zero gas. This keeps a 144-slot day at O(1) storage.
- `abandonEpoch(agentId, epochId, string reason)` - owner-only, marks the epoch abandoned early. All remaining slots resolve Missed. Exists so abandonment is an explicit, visible, on-chain act rather than a silent stop.

### RecordBook (mainnet) - the core
State per `agentId`: current epoch, per-slot `Commit`, per-slot `Entry`, operator (read from FiefAgent).

```solidity
struct Commit { bytes32 reqSha; bytes32 respSha; bytes32 receiptCommit; address provider; uint64 committedAt; }
struct Entry  { bytes32 respSha; bytes32 reqSha; address provider; address teeSigner;
                uint32 slot; uint64 epochId; bytes32 inputHash; address renter;
                bytes32 decisionDigest; uint64 revealedAt; }
```

- `commitDecision(agentId, epochId, slot, reqSha, respSha, receiptCommit, provider)`
  1. `msg.sender == operator(agentId)`
  2. `epochId` is the agent's open epoch; `slot < spec.slotCount`
  3. **`block.timestamp <= slotCommitDeadline(epochId, slot)`** - reverts `SlotDeadlinePassed`
  4. slot not already committed - reverts `SlotAlreadyCommitted`
  5. `provider` is in the epoch's pinned set
  6. store `Commit`, emit `DecisionCommitted`
- `revealDecision(agentId, epochId, slot, respData, sig, commitOffset, inputHash, renter, salt)` - **permissionless**
  1. a `Commit` exists for the slot; not already revealed
  2. `block.timestamp >= slotRevealOpen(epochId, slot)` - reverts `RevealTooEarly`
  3. `keccak256(abi.encode(respData, sig, commitOffset, inputHash, renter, salt)) == receiptCommit` - reverts `BadReveal`
  4. `sha256(respData) == stored respSha` - reverts `BadHash`
  5. `text = hex(reqSha) ":" hex(respSha)`, exactly 129 ASCII bytes; `digest = EIP-191(text)`; `signer = ecrecover(digest, sig)`
  6. `signer == getService(provider).teeSignerAddress && teeSignerAcknowledged` - reverts `BadSigner`
  7. rebuild `EXP = "content":" || COMMIT_LINE(book, chain, agentId, epochId, slot, H(agentId,epochId), inputHash, renter)`; require `respData[commitOffset .. +EXP.len] == EXP` - reverts `BadCommit`
  8. store `Entry`, emit `DecisionRevealed`

  Canonical encodings, byte-identical to the runtime: addresses 42-char `0x` lowercase (null renter = zero address, never `"0x0"`); bytes32 66-char `0x` lowercase; agentId/epochId/slot decimal ASCII.
- `commitDecisionStrict` / `revealDecisionStrict` - demo variants that emit `DecisionRejected(reason)` instead of reverting, so the red transactions are visible on-chain rather than being failed txs. Documented as a judge-legibility choice, not used in production.
- `expectedTeeSigner(provider)` - staticcall `InferenceServing.getService(provider)` on `0x4734...8d84`, read `teeSignerAddress`, require `teeSignerAcknowledged`. The `pinSigner(provider, signer, evidenceURI)` admin path survives only as an override for separated-decentralized providers and for the testnet-Compute narrowing. When pinned, claim language shifts from "read live from 0G's contract" to "pinned from 0G's attestation, evidence linked".

### RentalDesk (mainnet)
- `list(agentId, feePerDecisionWei, minEscrow, termSeconds)` - owner-only.
- `rent(agentId) payable` - `expiry = block.timestamp + termSeconds`; `maxDecisions = msg.value / feePerDecisionWei`; creates a grant `{ renter, epochId, expiry, maxDecisions, remainingEscrow }` keyed by `(agentId, renter)`. **The grant records the epoch it was bought against.**
- **Epoch binding (patch.md item 4).** A grant is valid only for its `epochId`. If the owner opens a new epoch (a new brain), the grant does not silently follow. It pauses, and the renter either consents to the new epoch or withdraws the unspent escrow. Nobody keeps paying for a strategy they did not buy.
- `settle(agentId, slots[])` - pulls `feePerDecision` per **Revealed** entry whose `renter` matches the grant, pays the current owner minus 200 bps, decrements escrow. Settlement on reveal, not commit, so the renter only pays for signals that were actually proven. Pull pattern, no push transfers.
- `cancel/expire` - renter reclaims unspent escrow after expiry.
- Conservation enforced: `escrowed == settled + refunded + remaining`, tested against the reference model.
- Grants survive agent transfer until expiry; settlement pays the owner at settlement time.

### TeemlReceiptVerifier (mainnet, stateless library)
Unchanged from v1. `verify(bytes respData, bytes32 reqSha, bytes sig, address expectedSigner) -> bool`, doing the sha256 precompile, the 129-byte text rebuild, the EIP-191 prefix and the ecrecover. Published standalone as the upstream contribution.

---

## 6. State machines

**Agent:** Drafted -> Sealed (blob on Storage, H fixed) -> Registered -> Active -> Listed -> Rented (0..n grants) -> Resealed (new epoch) -> Transferred (record persists) -> Retired (operator cleared; record readable forever).

**Epoch:** Opened (spec immutable, startTime in the future) -> Running -> Finalized (summary written) | Abandoned (owner-declared, remaining slots Missed).

**Slot (new in v2, and the heart of the completeness claim):** Scheduled -> Committed -> Revealed. Terminal alternatives: **Missed** (no commit by `slotCommitDeadline`, derived) and **Invalid** (committed but the reveal failed verification, or the reveal window closed with a commitment that never opened). **Every scheduled slot lands in exactly one of Revealed, Missed, Invalid. There is no fourth state and no way for a slot to disappear.**

**Rental:** Listed -> Escrowed -> Active(epochId, expiry, allowance) -> Consuming (settle per revealed slot) -> Paused(new epoch, awaiting consent) -> Expired | Revoked -> Refunded remainder.

**Transfer:** ownership moves on `FiefAgent.transferAgent`; `RecordBook` is keyed by `agentId` and is untouched. v2 makes no cryptographic re-encryption claim, because it no longer uses the draft oracle.

---

## 7. Invariants

- **I1** Every Revealed entry passed on-chain signature recovery to the expected TEE signer.
- **I2** At most one commit per `(agentId, epochId, slot)`; at most one reveal per commit.
- **I3** The record is append-only. Transfer, rental and reseal never mutate existing entries.
- **I4** Sealed key material and strategy plaintext never appear in calldata, events, logs, API responses, client bundles or error messages.
- **I5** Rental conservation: `escrowed == settled + refunded + remaining`, always.
- **I6** Epochs never overlap for an agent, and entries never cross epochs.
- **I7** Audit access is a distinct, owner-signed key-sealing action, logged. Renting never exposes the sealed key.
- **I8** `respSha` stored on-chain always equals `sha256` of the archived public `respData` on Storage.
- **I9** Only the registered operator can commit. Reveal is permissionless by design.
- **I10** Every public claim in the README and submission copy maps to a claims-ledger row at its proven rung or lower.
- **I11 (new)** No epoch may be opened whose `startTime` is in the past. Enforced on-chain.
- **I12 (new)** No commit is accepted after its slot's `commitDeadline`. Enforced on-chain.
- **I13 (new)** For a finalized epoch, `committed + missed == slotCount`, and `revealed + invalid == committed`. Every scheduled slot is accounted for. This is the completeness invariant and it is the one that makes the v2 claim falsifiable.
- **I14 (new)** A reveal is accepted only if it opens the exact commitment stored at commit time.
- **I15 (new)** A grant settles only against slots in the epoch the grant was bought for.

---

## 8. Public/private boundary

The boundary is now **time-phased**, which is the whole point of §4.2.

| Field | Private forever | Private until audit grant | Public at commit | Renter at commit | Public at reveal |
|---|---|---|---|---|---|
| Strategy plaintext, sealed key | x | | | | |
| reqBody | | x | | | |
| Epoch spec (market, cadence, horizon, deadlines, H) | | | x | x | x |
| reqSha, respSha, receiptCommit, provider | | | x | x | x |
| Slot index and its deadlines | | | x | x | x |
| **Decision direction, confidence, size** | | | | **x** | **x** |
| respData, signature, salt | | | | x | x |
| inputHash + archived snapshot | | | | x | x |
| Completeness counters | | | x | x | x |
| Outcome and scored performance | | | | | x |
| Rental terms, renter address | | | x | x | x |

Precise language, enforced in all copy: "strategy sealed on 0G Storage, never on the public chain"; "decisions attested by 0G TeeML"; "committed on-chain before the market outcome, revealed and verified after"; "request commitment sealed, auditable under authorized access". **Never**: "trustless", "unextractable", "impossible to fake". Also never: presenting Agentic ID or ERC-8004 data without the **testnet** label.

Distillation of a strategy from long observation of outputs is a documented residual risk, mitigated by rate limits and the disclosure delay, not denied.

---

## 9. Threat model

| Threat | Vector | Mitigation |
|---|---|---|
| Forged receipt | attacker signs with own key | I1: on-chain ecrecover over the recomputed 129-byte text must equal `getService(provider).teeSignerAddress` with `teeSignerAcknowledged` |
| **Selective omission (v1's hole)** | **owner runs N inferences, publishes only the winners** | **I11 + I12 + I13: schedule fixed before outcomes, on-chain commit deadline, every slot resolves. A dropped call is a permanent public `Missed`** |
| **Late commit** | **owner waits for the outcome, then commits** | **I12: `block.timestamp <= slotCommitDeadline` enforced on-chain, reverts `SlotDeadlinePassed`** |
| **Retroactive epoch** | **owner opens an epoch over a window already resolved** | **I11: `startTime >= block.timestamp` enforced on-chain** |
| **Selective reveal** | **owner reveals winners, sits on losers** | Reveal is permissionless, so the renter who already holds the plaintext can reveal. Unrevealed commits are reported separately and never counted as successes (I13) |
| **Epoch shopping** | **abandon bad epochs, keep good ones** | Not preventable, made visible: every epoch ever opened is listed including abandoned ones, and lifetime completeness spans all of them (§4.4 limit 4) |
| Reveal tampering | reveal bytes differ from committed bytes | I14: `keccak(abi.encode(...)) == receiptCommit`, plus `sha256(respData) == respSha` |
| Record graft | receipt from another model or agent | COMMIT_LINE `EXP` memcmp + I9 |
| Replay | resubmit an old receipt | slot uniqueness (I2) + book address and chainId inside the commit line |
| Cross-deployment replay | same receipt, other RecordBook | `book:<addr>` field in the commit line |
| Dishonest owner fakes H usage | request without the strategy echoes H | Documented limit (§4.4 limit 1), audit grants, ZK opening on the roadmap, claim narrowed accordingly |
| Operator key theft | attacker commits junk | `setOperator` rotation; junk reveals fail verification and land as `Invalid`, which is visible rather than silent |
| Strategy theft via API | leakage paths | I4, with a CI scan over calldata, events, API snapshots and client bundles |
| Renter distillation | copy behaviour from outputs | Rate limits, disclosure delay, documented residual |
| Escrow griefing | spam settles, dust | Pull pattern, reference-model rounding, minimum fee |
| Wash record | owner self-inflates volume | Record proves provenance and completeness, not alpha. P&L shown as context, explicitly not verified |
| Fake reputation | feedback from someone never served | ServeProof required by `giveFeedback`, bound to `submitter` and a `deadline` (§0.6 items 4-5) |
| Admin abuse | `pinSigner` misuse | Admin actions evented, evidence URI mandatory, listed in SECURITY.md |

---

## 10. Failure recovery

- **Provider down or 429 near a deadline.** Failover to the next pinned provider immediately. If no provider responds before `slotCommitDeadline`, the slot **becomes Missed and that is correct behaviour, not a bug**. v2 never backfills. A missed slot is honest; a late one would be a lie. The runtime alerts and the completeness number absorbs it.
- **Signature endpoint returns nothing for chatID.** Retry with backoff inside the deadline. If it never arrives, the slot is Missed. Note the contrast with v1, which discarded the decision and consumed no nonce, leaving no trace. That silent-discard path is exactly what v2 removes.
- **Commit tx fails.** Idempotent resubmit with the same payload while the deadline allows. Slot uniqueness makes double-commit impossible.
- **Reveal tx fails or is never sent by the owner.** Anyone with the plaintext can reveal, including the renter. Persistent non-reveal shows as Committed-but-unrevealed and is reported separately from Revealed.
- **Batch fee settlement drains the sub-account mid-run.** Runtime monitors the ledger and auto-tops from the main balance; alerts below threshold. Current headroom is 9.45 OG (§0.6 item 6).
- **Storage upload failure.** The chain commitment still lands; snapshot archival retries; I8 checked by a reconciliation job.

---

## 11. Reference model (packages/reference)

Pure TypeScript, zero chain deps. Exports: `buildCommitLine`, `buildExpectedCommit`, `findCommitOffset`, `canonicalRequest`, `canonicalSnapshot`, `signedText`, `verifyReceipt`, `buildReceiptCommit`, `slotSchedule`, `resolveSlot`, `epochSummary`, `applyCommit`, `applyReveal`, `settle`, `reseal`, `transfer`, `authorize`, `scoreOutcome`.

Property tests (fast-check) plus exhaustive enumeration of the rental settlement state space. **Mandatory cases**, all inherited from v1 plus the v2 additions:

*Inherited:* commit line embedded in an OpenAI envelope at a non-zero offset (correct `commitOffset` accepted; wrong offset, missing or late anchor, and a decoy earlier `"content":"` all rejected); canonical fixed-width encodings (42-char address including zero-address renter never `"0x0"`, 66-char bytes32, decimal ids); mismatched `inputHash` or `renter` rejected; signature v 27 and 28; wrong signer; boundary hex casing; empty and max-size respData; malformed commit lines with every field mutated; conservation with dust and zero fee; revoke mid-consumption; transfer mid-rental.

*New in v2:* commit accepted exactly at the deadline and rejected one second after; epoch with `startTime` in the past rejected; reveal before `revealOpen` rejected; reveal with any of the eight committed fields altered rejected; `committed + missed == slotCount` over randomized commit patterns; `revealed + invalid == committed`; slot resolution is total (a generated epoch with arbitrary gaps always classifies every slot); grant settling against a slot from a different epoch rejected; grant pausing on epoch advance; abandoned epoch resolves all remaining slots to Missed.

Fixture generator emits JSON vectors consumed by the Foundry tests. **Contract tests import fixtures and never restate expected values.**

---

## 12. Runtime specification

- Node 22, TypeScript, single process, pm2 on a VPS. Wallets: operator EOA (hot, low balance) and treasury (cold). Judge reproduction never depends on these keys: fixtures plus a testnet path in SETUP.md.
- **Slot scheduler (new).** A deterministic timer derived from the epoch spec, not a loop. At `slotSnapshotTime(E,k)` it fires the decision pipeline with a hard budget of `maxCommitDelay`. It tracks per-slot state and, on any failure, lets the slot go Missed rather than committing late. The scheduler is the component that makes the completeness claim operationally true, so it gets the heaviest test coverage in the runtime.
- **Storage adapter.** `@0gfoundation/0g-storage-ts-sdk@1.2.11`. Fief encrypts AES-256-GCM app-side before upload and records the merkle root, keeping key custody explicit even though the SDK now ships an `EncryptedFile` helper.
- **Strategy container.** Canonical JSON `{ version, model params (temperature 0), systemPrompt (strategy logic + the output contract mandating the COMMIT_LINE echo as line one), riskParams, featureConfig }`. `H = keccak256(JCS canonical bytes)`. Encrypted AES-256-GCM, key sealed to the owner pubkey (ECIES), blob to 0G Storage.
- **Canonical request builder.** Exact byte layout fixed and unit-tested against sha256 vectors. The broker must hash the same bytes we hash; EXEC gate P0.2 confirms no proxy mutation.
- **Decision loop.** snapshot -> request -> inference -> output-contract validation (line one equals COMMIT_LINE byte-exact, else one retry inside the deadline budget) -> signature fetch -> local verify -> commit -> push to renter feed -> archive to Storage -> reveal after the disclosure window.
- **Renter feed.** Authenticated SSE and webhook per grant. Each message carries the cleartext decision **and the full receipt** (`respData`, `sig`, `commitOffset`, `salt`, commit txHash) so a sophisticated renter verifies before acting rather than trusting the feed. This is a product surface, not a debug channel (patch.md item 7).
- **ServeProof issuance.** Per served slot, the runtime signs a `ServeProof` with `agentSeal` (`submitter` = the renter, declared via `X-Client-Address`, `deadline` = grant expiry), which the renter redeems on the testnet ReputationRegistry via `giveFeedback`.

---

## 13. Economics

Rental fee per decision, set by the owner in OG wei. Protocol fee 200 bps.

The missing piece in v1 was why anyone would pay when the decision was public the moment it existed. With delayed disclosure the loop closes: authors monetize proprietary alpha without publishing the strategy or giving away live calls; renters pay for time advantage plus provenance and keep custody and execution; Fief earns on paid access; the delayed public record becomes the author's acquisition channel. Better forward performance attracts more renters, more rentals produce more independent ERC-8004 feedback, and every new paid inference is more 0G Compute usage.

Costs: mainnet gas (commit is a cheap struct write; reveal carries one sha256 of <=512B, one ecrecover, one staticcall and one memcmp, estimated well under 250k gas, measured in P3), inference fees (~0.003 USD per 1k tokens scale), storage dust. A 5-minute cadence is 12 slots/hour, far inside the 30/min rate limit.

**Forward-performance metrics (patch.md item 6).** Published per epoch and per lifetime, all recomputable by `fief verify` from public data: completeness, sample size, directional hit rate, Brier score where confidence is emitted, hypothetical fixed-rule return, max drawdown, decision latency (snapshot to commit), and strategy age. **Signal performance is labelled distinctly from executed P&L, because Fief does not execute renter trades.**

---

## 14. Proof ladder and claims ledger

Rungs: 1 reference model, 2 unit/property, 3 adversarial, 4 real SDK against a live provider locally, 5 testnet composed, 6 mainnet deployment, 7 mainnet composed transactions, 8 browser flow, 9 read-only independent verifier, **10 (new) multi-day forward campaign with published completeness**.

`claims.yaml` rows: `{ claim, rung, evidence (tx/test/file), network, date, status: verified|failed|reported }`. CI fails if README numbers drift from the ledger. Never counted as evidence: deployed-but-unused contracts, mocked calls, predicted gas, local runs presented as public, or **testnet activity presented as mainnet**.

---

## 15. Repo and judge path

Public repo baseline: README, ARCHITECTURE.md (mermaid), SECURITY.md (threat model + honest limits), DECISIONS.md, SETUP.md, CONTRIBUTIONS.md, claims.yaml, LICENSE (MIT, uniformly, now that the fork is dropped). `/internal/` gitignored before launch.

README first screen, in order: one-liner; the mechanism sentence; live app link; 60s clip; network = 0G mainnet 16661; the epoch completeness bar; the commit tx, the reveal tx and the two red txs; `pnpm fief verify --agent N --epoch E`; honest status block.

Two-minute judge path: proof page -> epoch completeness -> the commit timestamp against the outcome time -> the reveal -> two ChainScan links -> one verify command -> clip. No key needed for read-only.

CONTRIBUTIONS.md targets:
- (a) `TeemlReceiptVerifier.sol` published standalone, with an upstream issue or PR to `@0gfoundation/0g-compute-ts-sdk` proposing an on-chain verification example. Genuinely additive, since the SDK's own `processResponse` only ecrecovers the provider-returned text.
- (b) Issue on `0g-agent-nft` documenting the permissive draft verifier respectfully, with a concrete suggested check for each path.
- (c) **New:** data-bound reputation for the Agentic ID SDK. Its own GUIDE notes that filtering reputation by the agent's current data is designed but not yet in the SDK. Fief needs exactly this, because strategy epoch 5 must not inherit epoch 2's score. A clean upstream contribution here is worth more than an issue against the obsolete draft.

---

## 16. Phased implementation gates

Reordered per patch.md: the commercial loop moves into Wave 3, because the pre-committed demo already shows a rental and shipping a video that contradicts the code is not an option.

**Wave 3 (deadline 2026-08-30 16:00).**

- **P0 - live seams. COMPLETE except P0.5.** P0.0 done. P0.1 **closed** (ledger funded). **P0.2 GREEN on mainnet 2026-08-25** (§0.6.1): no proxy mutation, signer matches `getService()`, live parse path proven. **P0.3 GREEN live.** **P0.4 deleted** (SDK swapped). P0.5 remaining: testnet faucet top-up (testnet balance is 0), then deploy the v2 contracts to 16602. *Gate: P0.2 green - **passed**, P1 is unblocked.*
- **P1 - reference model. COMPLETE 2026-08-25.** `packages/reference` built: `commit`, `receipt`, `epoch`, `recordbook`, `rental`, `score`, plus a deterministic fixture generator. **87 tests green, `tsc --noEmit` clean**, fixtures byte-identical across runs. Property tests (fast-check) cover slot-resolution totality (I13) and escrow conservation (I5). `fixtures/slots.json` carries five vectors including the tampered-strategy-byte red case and a cross-slot replay. A fixture-integrity test re-derives every field from the committed JSON, so the Foundry suite can consume it without restating expected values. *Gate: passed.*
- **P2 - contracts local. COMPLETE 2026-08-25.** `TeemlReceiptVerifier`, `EpochBook`, `RecordBook`, `FiefAgent`, `RentalDesk`, `lib/Bytes`. **63 Foundry tests green**, all expected values imported from the P1 fixtures. Adversarial coverage for late commit, retroactive epoch, reveal tampering, cross-slot replay, wrong/unacknowledged signer, provider-lookup failure, unpinned provider and non-operator. Fuzzed: I13 totality (256 runs), I5 conservation (256 runs), and a differential fuzz of the assembly memcmp against a naive implementation. **Measured gas: commit 138,424; reveal 235,827** for a 576-byte response, inside the §13 budget. *Gate: passed. Stop: no deployment.*

  Two design defects were found and fixed during implementation, both recorded in DECISIONS.md: a failed reveal originally burned the slot, which under permissionless reveal let anyone destroy an honest agent's completeness; and `Entry` duplicated three fields already held in `Commit`, costing four needless SSTOREs per reveal.
- **P3 - runtime and local end-to-end. COMPLETE 2026-08-25.** `runtime/` built: config, ABIs, `BookClient` (viem), `ComputeClient`, strategy container, slot loop, and two CLIs. Typecheck clean. **Full loop green on testnet 16602 with real mainnet 0G Compute inference**: agent registered, forward epoch opened before any slot existed, 2/2 slots committed inside their deadlines, 2/2 revealed after the disclosure window and verified byte-exact on-chain, **completeness 100%** read back from `EpochBook`.

  **Adversarial run green, 4/4** (`pnpm adversarial`): a late commit rejected `SlotDeadlinePassed`, an early reveal rejected `RevealTooEarly`, a one-byte-tampered reveal rejected `BadReveal`, and the honest reveal of that same slot still accepted afterwards, which proves the anti-griefing property against live infrastructure rather than only in tests.

  *Gate: rung 5, passed.*

  Live artifacts (testnet 16602, chainscan.0g.ai):

  | what | value |
  |---|---|
  | FiefAgent | `0xe76dBE7FCf8c7F784b05DF88996bd63CA2c4d7D6` |
  | EpochBook | `0x152A5a433A6592df57d7F77B7B01eEE00C481C2d` |
  | RecordBook | `0x5606cd137E5E90f72cD5B1Bb3Db642B09a99A19E` |
  | RentalDesk | `0x234c6C2d9f1805CF1326eB2Ac4C429f6E53D0004` |
  | commit (green) | `0xd687707d7dca064b6052a0fad60043cff89c0537a4ca9543f00f1c22180f8ccd` |
  | reveal (green) | `0xbc9b635799d9e2008aad75bad0b767d129b0e26708add41965887fde678d01e2` |
  | honest reveal after tamper | `0xfae24f1d4c30296c61804353032d9473d0a58a39a6d4eb519d795a28c7350f1a` |
- **P4 - mainnet. CORE COMPLETE 2026-08-25.** Deployed to 16661 after a Slither audit (see `contracts/SLITHER.md`). Agent 1 registered, a real forward epoch opened with its schedule fixed before any slot existed, **2/2 slots committed inside their deadlines, 2/2 revealed and verified byte-exact on-chain, completeness 100%**. Adversarial run **4/4 on mainnet**.

  **The signer resolves live.** `pinnedSigner` for the provider is the zero address and `expectedTeeSigner` returns `0xA46EA4FC…46B9` straight from `InferenceServing.getService`. On mainnet the testnet split disappears, so the narrowed "pinned from 0G's attestation" language does not apply and §2's strong claim stands as written.

  Remaining for P4: the sealed strategy blob is not yet on 0G Storage (`storageRoot` is currently zero), and the frontend env wiring plus a `revealDecisionStrict` red transaction are still to do. *Gate: §2 claim evidenced on mainnet.*

  **Mainnet 16661 (chainscan.0g.ai):**

  | contract | address |
  |---|---|
  | FiefAgent | `0x4db74faF047160893Aa0dabC9A1B8F3297570a68` |
  | EpochBook | `0x9f02bfBbc52fD91d1899C298B71AF1871CA45DF8` |
  | RecordBook | `0x40eB003340f467e096F8Ae30f8696bE40Eba922c` |
  | RentalDesk | `0x75C6ce6c6Cc40c922B30F985e75580C32Cd78e57` |

  | artifact | tx |
  |---|---|
  | agent registered | `0x44cd8c1014715dd22308b3da3064053bb858ca9ec40f7681b5456dd30feac313` |
  | epoch opened | `0xff110283121f8bb2e234ca49cad7f009f43a49fa874e37a1a1281f89e66d9e63` |
  | **commit, slot 0 (green)** | `0x5192be628e1ca47846a335f4a6628946e1db3bcb9111ee92122836b39866d934` |
  | commit, slot 1 | `0x89222049d1654e86693dd6b3f894f1c266b545b2efbda9eafb8500595e380d8f` |
  | **reveal, slot 0 (green)** | `0x8cdd4c11c828e65d93dc11a291eab22fa7c0837acacf9b714904b2a5d145d0bf` |
  | reveal, slot 1 | `0x232c804f4ae73c4ca2ebae5ecf1d2b7a64c56b3dd5e7cb5a2e89bfb531c19ca1` |
  | honest reveal after a tamper attempt | `0x02fb705977322b83107a8b37da4f5a8460d3f03cb7b1302afbc32e7085a4b161` |

  Testnet 16602 rehearsal on the same audited code: RecordBook `0x2F13E70b79cfFc330Df8cccfAc880149749698E1`, epoch 2/2 at 100%, adversarial 4/4.
- **P4.5 - the rental loop. COMPLETE 2026-08-25.** The full commercial loop ran on mainnet from a wallet that is not the deployer.

  Agent 6 listed at 0.0005 OG per decision. Renter `0xae8caDeDa5B0C762ECC2a242544A6A1b04Ebd40E`, a freshly generated keypair funded with dust, escrowed 0.002 OG for 4 decisions from its own signer. The agent then produced a decision **naming that renter in the commit line**, so the TEE signed a response bound to them, which is what lets `settle` prove the fee is owed.

  **The step that matters:** the renter received the cleartext at commit time and verified it against the on-chain `receiptCommit` **before any reveal existed** (`payload opens the on-chain commitment: true`, `commit line names this renter: true`). That is the private phase working rather than being described. A renter never has to trust the feed.

  Settlement consumed 0.0005 OG of the escrow (1/4 decisions, 0.0015 OG remaining) and credited the owner, who then withdrew. Pull payment throughout.

  | step | tx |
  |---|---|
  | list | `0xbcc58d2054be40e6e62786afe00943549d4cbb99ba1bceaa490187c1d22b210b` |
  | rent (from the renter's wallet) | `0x8ecc9978c206ce4072f4e744d70814fb568988ab31b0138ec615966e60d06ee1` |
  | commit (sealed, bound to the renter) | `0x1c50b938bd21a11632c17a0ca1064e0039921566d8183d287d45b02393cb61d0` |
  | reveal | `0x4a9bd0152d3a201aa8a1e323be5f0e074e534caf63a1fa7aba3e23126ac2cdcd` |
  | settle | `0x5c7dcb515890142acbebf850956f014202f3e46c70833d0a56bb5902eab464ec` |
  | withdraw | `0x7b3450bf363246e91184d18ab4873f18d5a5e610639f8fcc66322f0b87c1c94e` |

  *Gate: a rental settled from a wallet that is not the deployer. Passed.*

### 16.2 ERC-8004 reputation - serve proofs proven, redemption scoped

Fief can issue valid ERC-8004 serve proofs, and that is checked by 0G's code rather than ours: every assertion routes through the Agentic ID SDK's own `verifyServeProofSignature`. 7 unit tests in CI plus a live check (`pnpm reputation`, 6/6) against the production attestor.

What is proven:

- The pinned registry addresses match the production attestor's live `GET /config` (`agenticid.0g.ai`), so an upstream proxy redeploy fails loudly instead of writing feedback to a dead contract. Addresses were read from the attestor, not copied from a doc.
- A proof binds to exactly one redeemer. `submitter` is inside the signed digest, so a proof handed to the wrong party is worthless.
- A proof binds to exactly one slot. `taskHash` commits to `(fiefAgentId, epochId, slot, renter)`.
- `dataHashes` carries the strategy commitment and the input, so reputation is tied to the strategy version that earned it. The SDK's own guide flags data-bound reputation as designed but not yet in the SDK; this is the upstream contribution target in §15.
- The `AgenticIDReputationRegistry` proxy is deployed and reachable at `0xede70197313d0b603612dfc9801162d1ada3d196` on 16602.

**What is not done, and why.** `giveFeedback` requires an agent minted in the AgenticID registry with a registered `agentSeal`, and minting reverts `AgenticIDNotTrustedAttestor` unless a trusted attestor deploys the agent into 0G's TEE sandbox. That is a sandbox-runtime integration, not a signature problem: it means running the Fief agent as a sandboxed Agentic ID agent under one of the attestor's frameworks (`openclaw`, `hermes`, `prime-agent`). Scoped as the remaining leg rather than stubbed, and it also needs testnet OG, which is at 0.0039.
- **P5 - submission.** README first screen, video to the §17 screenplay, X post, AKINDO fields, cold adversarial audit, clean-clone reproduction. *Gate: filed before the deadline. Stop: nothing new after code freeze.*

**Wave 4 (deadline 2026-09-20).** The 100-plus-slot forward campaign with published completeness (rung 10); Agentic ID migration to mainnet if upstream ships; third-party strategy author onboarding, which is worth more than ten self-owned agents against the 10% traction axis; `fief verify` hardened as a first-class public product; second and third agents.

**Wave 5.** Marketplace polish, Token2049 assets, and one deep extension. First candidate: the ZK prefix opening, which removes §4.4 limit 1 entirely.

### 16.0 Frontend migrated to v2 - COMPLETE 2026-08-25

`web/` spoke the v1 commit line (`nonce:<n>`) across 12 files. It now speaks v2 (`slot:<k>`), and the migration was more than a rename:

- `DecisionEntry` is keyed by `slot` and carries `state: SlotState`, `committedAt`, `commitDeadline`, `revealOpen`, `commitTxHash` and `receiptCommit`. `entryIndex` and `nonce` are gone.
- **`decision` is now optional.** A committed-but-unrevealed slot genuinely has no public direction, and the UI says "sealed until reveal" rather than rendering a blank. That is the §4.2 economics made visible: the renter is paying for exactly that window.
- `EpochSummary` is a first-class type and every agent carries `currentEpoch`. It is derived from the generated ledger, never authored, so the completeness bar and the ledger cannot disagree. Agent 1's fixture schedules two more slots than it committed, so completeness reads below 100% and stays a real metric rather than decoration.
- `RejectReason` narrowed to the five reveal-time failures a viewer can actually see. Commit-time failures (`NotOperator`, `SlotAlreadyCommitted`, `ProviderNotPinned`, `NoCommit`) never produce a record entry; they produce a missed slot, so they belong to completeness. The `Record<RejectReason, …>` total-map in the fixtures keeps every red variant reachable at compile time.
- `RenterFeedMessage` now carries `commitTxHash` (and `revealTxHash` once opened), because a renter is notified at commit time and must be able to check the payload against the on-chain `receiptCommit` before acting.
- Settlement is slot-addressed, matching `RentalDesk.settle`.

**Drift cannot recur.** `packages/reference` is a devDependency of `web/` and `commit.parity.test.ts` asserts the frontend's commit-line bytes equal the reference model's, including that `nonce:` never reappears. The reference package stays out of the browser bundle.

Verified: lint, typecheck, copy-guard (86 files), contrast (24 pairings), 75 tests, and `next build` all green.

### 16.1 Scope risk, stated plainly

This plan is roughly 8-9 focused days of work against about 5 remaining days, and it was chosen with that arithmetic on the table. The gates are ordered so that value lands in dependency order: if time runs out after P4, the submission still has a mainnet contract, a real forward epoch and the green/red pair, which satisfies every hard Wave 3 requirement. P4.5 is the first thing to cut, and cutting it costs the demo's rental beat, not its validity. If P4 itself is at risk by 2026-08-28, fall back to §20.

---

## 17. Demo screenplay (pre-committed, <= 3 min)

1. **0:00 problem.** A real-looking bot listing with a fabricated backtest. One line: you cannot verify any of this, and even a real track record can be edited by deleting the losses. (15s)
2. **0:15 the epoch opens.** Show `openEpoch` on ChainScan: market, cadence, horizon, deadlines, 144 slots, all fixed at a block timestamp before any of it happened. "Everything after this is on a schedule the operator can no longer change." (25s)
3. **0:40 a live slot.** Snapshot in, 0G Compute inference, receipt obtained. Wallet B (the renter) sees `UP` in the feed with its receipt. The public chain gets only a sealed commitment. Camera on the commit timestamp. (45s)
4. **1:25 the two failures.** Submit a different answer for that slot: red, rejected. Submit a commit for a slot whose deadline has passed: red, rejected. (25s)
5. **1:50 the reveal.** Advance to a completed slot past its horizon. Reveal it. The contract recomputes the 0G receipt against the authoritative TEE signer, the decision becomes public, the outcome scores. (35s)
6. **2:25 zoom out.** The completeness bar: `127 expected / 127 committed / 124 revealed / 3 pending / 0 missing / 0 backfilled`. (15s)
7. **2:40 independent verification.** `fief verify --agent 1 --epoch 4` in a clean terminal reaching the same result without the frontend. (20s)

The rental beat at step 3 is now backed by shipped code (P4.5), which is exactly the contradiction §16 was reordered to remove.

---

## 18. X post (mandatory elements)

Project name, demo clip or screenshot, the completeness bar, one ChainScan link, `#0GBridge #BuildOn0G`, tagging `@0G_labs @0G_Builders @AKINDO_io`. The hook is the mechanism sentence from §1, not a feature list.

---

## 19. Non-goals (v1 of v2, explicit)

Not a fund, not a custodian, not an execution venue. Fief never trades on a renter's behalf. No claim that the strategy is unextractable. No claim that the record proves alpha; it proves provenance, timing and completeness. No mainnet Agentic ID claim while upstream is testnet-only. No leaderboard ranking by P&L in v1 of v2, because signal performance and executed P&L must not be conflated.

---

## 20. Kill criteria and pre-approved narrowings

Updated 2026-08-25. The signature format, endpoint, scheme and the `getService` signer read are SRC-confirmed, and funding is closed, so most of v1's triggers are retired. What remains:

- ~~**Broker mutates our canonical `reqBody`**~~ **RETIRED 2026-08-25.** P0.2 ran green on mainnet: `sha256(reqBody):sha256(respData)` matched the provider's signed text exactly (§0.6.1). No mutation. The core mechanism is live-proven.
- ~~**No TeeML provider reachable on mainnet**~~ **RETIRED 2026-08-25.** Six TeeML decentralized services are acknowledged on mainnet, four of them chat models, and one is confirmed working end to end.
- **Provider health, the live risk that replaced them.** `gpt-5.4-mini` is deterministically broken (502 `zktls_error`) despite a funded sub-account. Pin a *set* of TeeML providers per epoch (`providerSetHash` in `EpochSpec` already supports this), health-check before each slot, and fail over inside the commit deadline. A provider outage that outlasts the deadline produces an honest `Missed`, never a late commit.
- **Time runs out before P4.** Narrowing, in order: cut P4.5 (rental) to Wave 4; cut the second red transaction; cut the reveal automation and reveal manually for the demo. Do not cut the epoch schedule or the commit deadline, because those are the v2 claim.
- **Agentic ID never ships to mainnet.** Not a kill. The identity and reputation layer stays labelled testnet, and the mainnet record is unaffected because `RecordBook` is keyed by `agentId`.
- **0G Storage round-trip fails on the maintained SDK.** Low risk, small blob. Fall back to the Indexer HTTP API directly.
