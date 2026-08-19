# FIEF - Product Requirements Document v1
Mode D output. Product locked 2026-08-17. Target: 0G Bridge by AKINDO, entering Wave 3.
This document lives in `/internal/`. Tracked in git for now so collaborators have full product context; slated to be gitignored before public launch (PRD §15). Its history will persist in git even after that. Derived build prompts execute one phase at a time.

---

## 0. Provenance and evidence levels

Every technical claim in this PRD is tagged:

- SRC: verified by reading the actual source code (0g-compute-ts-sdk v0.9.0 npm package, 0g-serving-broker main branch, 0g-agent-nft eip-7857-draft branch, pulled 2026-08-17)
- DOC: verified in official 0G documentation (docs.0g.ai, fetched 2026-08-17)
- EXEC: requires live execution to confirm. Every EXEC item is owned by a Phase 0 gate. Nothing EXEC-tagged may be claimed publicly before its gate passes.

Sources of record:
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference (Direct path, verification modes, limits)
- https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857 (standard, oracle types)
- github.com/0gfoundation/0g-serving-broker, api/inference/internal/ctrl/signing.go (signed payload format)
- github.com/0gfoundation/0g-agent-nft, branch eip-7857-draft (reference contracts)
- npm @0gfoundation/0g-compute-ts-sdk 0.9.0 (network constants, processResponse)
- Hackathon brief supplied by operator (submission requirements, judging weights)

---

## 0.5 Verification pass - 2026-08-19 (gate resolutions and corrections)

Re-verified against live sources on 2026-08-19: `@0gfoundation/0g-compute-ts-sdk@0.9.0` (npm pack), `0gfoundation/0g-serving-broker` @ main (`api/inference/internal/ctrl/signing.go`), `0gfoundation/0g-agent-nft` @ `eip-7857-draft`, `@0glabs/0g-ts-sdk@0.3.3`, and docs.0g.ai. Note: the `0glabs/*` and `0gfoundation/*` GitHub orgs redirect to the same repos; canonical org per docs is `0gfoundation`. The compute signature seam is byte-exact confirmed, the P0.3 on-chain signer read is resolved, and six PRD errors are corrected below.

### Gate status
| Gate | Status | Note |
|---|---|---|
| P0.0 deadline | RESOLVED | Wave 3 submit deadline 2026-08-30 16:00 (AKINDO page snapshot 2026-08-19; a later 2026-09-10 16:00 date also appears, treat as judging/grace, plan against Aug 30). Confirm live countdown before code freeze. |
| P0.1 funding | RELAXED, not a blocker | Owner-provided (operator decision 2026-08-19). 3 OG ledger deposit + 1 OG per provider stays an operational step, not a gate. |
| P0.2 signature seam | DE-RISKED, one live step remains | Format, endpoint, scheme, JSON shape all confirmed in source (see below). Live-EXEC that still needs a funded run: at least one TeeML decentralized provider reachable on mainnet with `teeSignerAcknowledged == true`, and `sha256(our canonical reqBody)` equals the returned `text` prefix for our exact bytes (no broker proxy mutation). |
| P0.3 on-chain signer read | RESOLVED | `InferenceServing.getService(address) view returns (Service)`; the Service tuple exposes `teeSignerAddress (address)` and `teeSignerAcknowledged (bool)` on-chain. The pin-with-evidence path downgrades to optional, needed only for `additionalInfo.TargetSeparated == true` providers (off-chain `TargetTeeAddress` override). |
| P0.4 storage seam | DE-RISKED, live step + deprecation check remains | SDK = `@0glabs/0g-ts-sdk` (ISC), does NOT encrypt, so Fief's AES-256-GCM plan stands. NEW risk: the package is marked DEPRECATED on npm ("no longer supported"). P0.4 must confirm it still uploads/downloads against current 0G Storage, else adopt the maintained successor / Indexer HTTP API. Blob is small, low risk. |
| P0.5 agent-nft seam | DE-RISKED, deploy + doc remains | Contracts, `mint`, `transfer`, `authorizeUsage`, and both verifier functions read and confirmed (with corrections below). Live-EXEC: build + deploy to testnet 16602, exercise mint + authorizeUsage + transfer with repo scripts, and document exactly what `verifyTransferValidity` enforces. |

### Confirmed byte-exact (upgrades the section 2 claim to source-solid)
- Signed text = `sha256hex(reqBody) + ":" + sha256hex(respData)`, lowercase hex, 64 + 1 + 64 = 129 ASCII bytes (`signing.go` `signChatWithKey`; doc comment says literally `sha256(reqBody):sha256(respData)`). On-chain the EIP-191 personal-message prefix is `"\x19Ethereum Signed Message:\n129"`.
- Scheme: ECDSA over `accounts.TextHash` (EIP-191) then `crypto.Sign`; recovery id normalized to 27/28 (`if sig[64] == 0 || sig[64] == 1 { sig[64] += 27 }`).
- Endpoint: `GET {providerURL}/v1/proxy/signature/{chatID}?model={model}` returns JSON `{text, signature, signing_address, signing_algo}` (`signing_algo == "ecdsa"`; centralized-only fields provider_type/provider_identity/tls_cert_fingerprint are omitempty and excluded in v1). SDK `Verifier.fetchSignatureByChatID` hits the identical URL.
- All section 3 chain/contract constants (16661, evmrpc.0g.ai, inference 0x4734..., ledger 0x2dE5..., fineTuning 0x4e34..., testnet 16602 / 0xa79F...) match the SDK constants file exactly.
- Strategic upgrade: the SDK's own `processResponse` does NOT recompute `sha256(req):sha256(resp)`, it trusts the provider-returned `text` and only ecrecovers over it against `getService().teeSignerAddress`. Fief's contract recomputes the 129-byte text from the actual request/response bytes before ecrecover, so Fief's on-chain check is strictly stronger than the reference SDK's. Headline talking point, add to README and video.

### Frontend handoff (2026-08-20)

The product is not being built in this repo pass. What ships now: this PRD (verified), a standard Next.js scaffold in `web/`, and a page-complete frontend handoff at `docs/frontend-handoff.md`. [@JemIIahh](https://github.com/JemIIahh) builds landing → dashboard against a typed mock `DataSource` on a branch and opens PRs into `main`. The owner (@winsznx) covers contracts / runtime / 0G / Supabase after the UI lands, or assigns remaining stack pieces then. UI work is intentionally parallel to P0 live steps (P0.2 funded inference, P0.4 storage round-trip, P0.5 testnet deploy) because the mock interface does not depend on them.

### Corrections (PRD claims that were wrong or imprecise, fixed inline below)
1. LICENSE: the draft repo is NOT GPL-3.0. `LICENSE.md` = CC0-1.0; `AgentNFT.sol` and `Verifier.sol` = MIT (SPDX headers); only `IERC7857.sol`, `BeaconProxy.sol`, `UpgradeableBeacon.sol` = GPL-3.0. Fief's forked contracts inherit MIT from AgentNFT/Verifier and Fief may license its own code MIT. Record the corrected decision in DECISIONS.md. (Affects sections 3, 5, 15.)
2. authorizeUsage: draft signature is `authorizeUsage(uint256 tokenId, address to)`, no `permissions` bytes. RentalDesk holds the grant<->token mapping itself (keyed by tokenId + renter); grantId is never encoded through authorizeUsage. (Affects section 5.)
3. mint: `mint(bytes[] proofs, string[] dataDescriptions, address to)`; each proof element must be exactly 32 bytes and is cast directly to a dataHash by the permissive verifier. Fief passes `proofs = [H, storageRoot]` as two 32-byte elements (H = keccak256, storageRoot = 0G merkle root, both 32 bytes). There is no separate storageRoot field. (Affects sections 3, 5.)
4. transfer: `transfer(address to, uint256 tokenId, bytes[] proofs)`; there is NO explicit sealedKey parameter. The sealedKey (bytes16) is parsed from the proof bytes (`bytes16(proof[178:190])`) and surfaced via `emit PublishedSealedKey`. (Affects sections 5, 6.)
5. Draft verifier is MORE permissive than section 3 first stated: `verifyPreimage` hardcodes `isValid = true` after only a 32-byte length check (mint/update accept any 32-byte hash). `verifyTransferValidity` verifies ONLY a receiver ECDSA signature (recovered address must equal `to`) plus a replay nonce; the TEE/ZKP proof itself is `// TODO: verify TEE's signature` with `bool isValid = true;`, and `attestationContract` is stored in the constructor but never read. Fief must claim ZERO cryptographic mint/transfer security from the draft verifier as-is. (Affects sections 9, 16; expands the CONTRIBUTIONS.md upstream issue.)
6. Storage SDK named and flagged: `@0glabs/0g-ts-sdk@0.3.3` (ISC), DEPRECATED on npm, does not encrypt. API: `file.merkleTree()` then `tree.rootHash()`; `new Indexer(rpc); indexer.upload(file, evmRpc, signer)`; `indexer.download(rootHash, out, withProof)`. (Affects sections 3, 4, 16.)
7. respData shape (design correction 2026-08-19): the TEE signs the provider's full OpenAI JSON envelope, so the echoed COMMIT_LINE lives inside choices[0].message.content, NOT at offset 0 of respData. §5 recordDecision now takes (inputHash, renter, commitOffset), builds the expected commit bytes from on-chain state + args, and asserts them immediately after a `"content":"` anchor (one memcmp at a caller-supplied, fully-validated offset) instead of slicing at offset 0. Fields are canonical fixed-width and renter is a full 42-char address (never "0x0"). The P0.2 spike records commit_line_at_content_offset_0 to confirm the exact live byte layout. (Affects sections 4, 4.1, 5.)

---

## 1. Product definition

One sentence: rent or buy a trading agent whose track record is signed by its own sealed brain, so the record can't be faked and the strategy never leaks.

Thesis: a track record is only trustworthy when it is cryptographically inseparable from the exact intelligence that produced it. 0G is the only stack where that binding is buildable today: TeeML-signed inference (0G Compute) + encrypted transferable intelligence (ERC-7857) + settlement (0G Chain) + sealed availability (0G Storage).

First user: a buyer of trading bots or paid signals who today chooses between fabricated backtests and blind trust in an operator. Second user: a strategy author who wants to monetize without disclosure. The first listed agents are Tim's own live agents (Delphi arena, OKX), which gives real records from day one.

Single verb: rent. The renter receives live, provenance-verified decisions. Execution of trades stays with the renter.

Decision domain v1: short-horizon BTC direction calls (UP / DOWN / FLAT plus confidence and size hint) against canonical OKX market snapshots, reusing existing agent logic from the Polymarket 5-min and LICTOR work. The mechanism is domain-agnostic; the domain is chosen for objective, fast-accruing records.

---

## 2. Dominant mechanism, falsifiable claim, headline proof

Dominant mechanism (the sentence a judge must remember): every decision the agent makes comes back TEE-signed by 0G Compute, is verified on-chain against the agent's sealed strategy commitment, and lands in a record that travels with the token when the agent is rented or sold.

Falsifiable core claim (v1, exact wording): given agent token N with sealed strategy hash H in epoch E, every Accepted record entry on 0G mainnet carries an ECDSA signature over sha256(request):sha256(response), recovered on-chain to the TEE signer registered in 0G's inference serving contract, where the response bytes (submitted in calldata and hashed on-chain) begin with the commitment line naming N, H, E, a strictly increasing nonce, and the input hash.

Falsified by any of: a receipt signed by a key other than the registered TEE signer being Accepted; a replayed nonce being Accepted; a response whose commitment line names a different token, hash, or epoch being Accepted; a record entry surviving a strategy swap into the new epoch; the contract accepting an entry whose respData does not hash to the signed text.

Headline proof: two ChainScan transactions side by side. One green, a real decision from a live 0G Compute inference, Accepted. One red, the same submission with one tampered byte, Rejected. Plus the counter: N live decisions recorded, 100 percent brain-bound, from a real trading run.

---

## 3. Verified platform facts (constants file, do not re-derive)

| Item | Value | Level |
|---|---|---|
| Mainnet chain ID | 16661 | SRC (sdk constants) |
| Mainnet RPC | https://evmrpc.0g.ai | DOC + SRC |
| Testnet chain ID / RPC | 16602 / https://evmrpc-testnet.0g.ai | SRC |
| Explorer | https://chainscan.0g.ai (storage: storagescan.0g.ai) | DOC |
| Inference serving contract (mainnet) | 0x47340d900bdFec2BD393c626E12ea0656F938d84 | SRC (sdk) |
| Ledger contract (mainnet) | 0x2dE54c845Cd948B72D2e32e39586fe89607074E3 | SRC |
| Fine-tuning contract (mainnet) | 0x4e3474095518883744ddf135b7E0A23301c7F9c0 | SRC |
| Inference serving contract (testnet) | 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E | SRC |
| Compute SDK | @0gfoundation/0g-compute-ts-sdk v0.9.0, Node >= 22 | SRC + DOC |
| Storage SDK | @0glabs/0g-ts-sdk v0.3.3 (ISC). DEPRECATED on npm; P0.4 must confirm it still round-trips or adopt successor / Indexer HTTP API. Does NOT encrypt (Fief does app-side AES-256-GCM). API: file.merkleTree().rootHash(); Indexer.upload / download | SRC |
| Signed receipt text | sha256hex(reqBody) + ":" + sha256hex(respData), lowercase hex, 129 ASCII bytes. On-chain EIP-191 prefix = "\x19Ethereum Signed Message:\n129" | SRC (signing.go, signChatWithKey) |
| Signature scheme | ECDSA over EIP-191 personal-message hash (accounts.TextHash), v normalized to 27/28 | SRC |
| Receipt retrieval | GET {providerBrokerURL}/v1/proxy/signature/{chatID}?model={model} returns {text, signature, signing_address, signing_algo} | SRC |
| chatID source | ZG-Res-Key response header, fallback data.id | DOC + SRC |
| TEE signer on-chain read | InferenceServing.getService(address provider) view returns Service{..., teeSignerAddress address, teeSignerAcknowledged bool}. Read live via staticcall. Separated-decentralized providers (additionalInfo.TargetSeparated==true) override via off-chain additionalInfo.TargetTeeAddress. P0.3 RESOLVED | SRC (getService ABI + processResponse) |
| Verification modes | TeeML (model inside TEE, self-hosted models) and TeeTLS (broker TEE proxies centralized LLM, signs routing proof incl. TLS cert fingerprint) | DOC |
| Compute account minimums | 3 OG initial ledger deposit, 1 OG minimum per provider sub-account. Owner-funded (operator decision 2026-08-19), not a blocker | DOC |
| Rate limits | default 30 req/min, burst 5, 5 concurrent, per user per provider | DOC |
| Fee settlement | delayed batch settlement by provider, sub-account balance drops in lumps | DOC |
| ERC-7857 reference | github.com/0gfoundation/0g-agent-nft, branch eip-7857-draft: contracts/AgentNFT.sol, interfaces/{IERC7857, IERC7857DataVerifier, IERC7857Metadata}, verifiers/{Verifier.sol, base/BaseVerifier.sol} (enum VerifierType{TEE,ZKP}, immutable attestationContract), proxy/{BeaconProxy, UpgradeableBeacon}, Utils.sol. Names confirmed 2026-08-19 (docs page shows an unrelated illustrative ERC7857/IOracle/OracleManager that is NOT in this repo) | SRC |
| Reference caveat | Draft verifier is permissive on BOTH paths. verifyPreimage (mint/update) hardcodes isValid=true after only a 32-byte length check. verifyTransferValidity checks ONLY a receiver ECDSA signature (recovered==to) + replay nonce; the TEE/ZKP proof is a // TODO stub (bool isValid=true) and attestationContract is stored-but-never-read. Fief claims ZERO cryptographic mint/transfer security from the draft as-is. Confirmed 2026-08-19 | SRC |
| Reference license | LICENSE.md = CC0-1.0. AgentNFT.sol + Verifier.sol + BaseVerifier.sol + Utils.sol + IERC7857DataVerifier + IERC7857Metadata = MIT. Only IERC7857.sol, BeaconProxy.sol, UpgradeableBeacon.sol = GPL-3.0. Fief fork inherits MIT; Fief code MAY be MIT (corrects the prior blanket GPL-3.0 assumption) | SRC |
| Hackathon | Wave 3 requires 0G mainnet contract + explorer activity; Compute/DA may stay testnet; public repo with wave-period commits; max 3-min video; mandatory X post with #0GBridge #BuildOn0G tagging @0G_labs @0G_Builders @AKINDO_io; judging progress 40 / integration 30 / quality 20 / traction 10 | Hackathon brief |
| Wave 3 exact deadline | 2026-08-30 16:00 submit (AKINDO page snapshot 2026-08-19; a later 2026-09-10 16:00 date also shown, treat as judging/grace). Reconfirm live countdown before code freeze | DOC (P0.0 resolved) |

---

## 4. Architecture

Components:

1. contracts/ (0G mainnet, Solidity 0.8.2x, Foundry)
   - FiefAgent: fork of AgentNFT.sol pinned to the eip-7857-draft commit. Sealed strategy: dataHashes = [H, storageRoot]. Adds operator registry per token and epoch counter.
   - RecordBook: verifies and stores receipts. The core contract.
   - RentalDesk: listings, escrow, grants, per-decision settlement, protocol fee.
   - TeemlReceiptVerifier: stateless library, on-chain verification of 0G TeeML receipts. Designed to be reusable by others (upstream contribution).
2. runtime/ (Node 22, TypeScript). The brainbox: holds the decrypted strategy only in memory, fetches market snapshots, builds canonical requests, calls 0G Compute (Direct path, broker SDK), retrieves signatures, submits entries on-chain, serves renter decision feed. Runs on a VPS (long-lived process with a wallet; not a Workers fit, exception to the Cloudflare default, recorded in DECISIONS.md).
3. packages/reference/ (TypeScript). Executable reference model. Specification until execution disproves it.
4. packages/verify/ (TypeScript CLI). Read-only independent verifier: `fief-verify --tx 0x...` recomputes everything from public RPC data.
5. web/ (Next.js on Cloudflare Pages). Listings, agent record page with green/red receipts, rent flow, owner console, proof page. Supabase (fresh project) for indexed reads only, chain remains the source of truth.
6. storage adapter: encrypted strategy blob and input snapshots to 0G Storage via the storage SDK.

Data flow, one decision:

```
snapshot(OKX) -> inputHash = sha256(canonical snapshot)
runtime builds reqBody = COMMIT_LINE || strategyPrompt || snapshot   (canonical bytes)
  COMMIT_LINE = "FIEFv1|book:<RecordBook 0x..40>|chain:16661|agent:<id>|epoch:<E>|nonce:<n>|strategy:<H 0x..64>|input:<inputHash 0x..64>|renter:<0x..40, zero-address if none>"
  (JSON-string-safe: no quotes/backslashes/control chars, and no "/" so the optional JSON \/ escape cannot apply; canonical fixed-width fields; renter is a full 42-char address, never "0x0")
runtime -> 0G provider (Direct, auth headers from broker SDK)
model output contract: the message content MUST begin with the same COMMIT_LINE, then a newline, then the decision JSON
runtime GETs {endpoint}/signature/{chatID}?model={model} -> {text, signature, signing_address}
runtime local check: sha256(reqBody):sha256(respData) == text (129 bytes), recover == getService(provider).teeSignerAddress
runtime finds commitOffset = byte index in respData of the `"content":"` that precedes the echoed COMMIT_LINE
runtime tx: RecordBook.recordDecision(tokenId, respData, reqSha, signature, provider, inputHash, renter, commitOffset)
contract: sha256(respData) on-chain, rebuild 129-byte text from (reqSha, respSha), EIP-191 recover,
          require signer == getService(provider).teeSignerAddress && teeSignerAcknowledged,
          build EXP = `"content":"` + COMMIT_LINE from on-chain state + (inputHash, renter) args,
          require respData[commitOffset .. +EXP.len] == EXP  (commitment is inside the OpenAI
          JSON envelope's message content, NOT at respData offset 0), then nonce++, store entry, emit
```

### 4.1 The binding construction and its honest limits

The TEE signature binds sha256(reqBody) and sha256(respData) (SRC). The request contains the secret strategy, so reqBody is never published; only reqSha goes on-chain, sealed.

Public on-chain binding therefore rides on the response: respData is small, public by design (it is the decision), submitted in calldata, and hashed with the sha256 precompile. respData is the provider's OpenAI-style JSON envelope (confirmed by the P0.2 seam), so the commitment is not at offset 0; the contract builds the expected commit bytes from its own state and asserts they appear at the head of choices[0].message.content (matched immediately after the `"content":"` anchor). This proves, publicly and on-chain: this decision output was produced by the registered TEE model, for a committed request, and the run declared agent N / strategy H / epoch E / nonce n / input i / renter r.

Known limitation, stated in SECURITY.md and the README, never hidden: the response-side declaration is produced by the model following the strategy prompt's output contract. A dishonest owner could run a request that does not contain strategy H yet instructs the model to echo H. Two remedies ship with the product:

1. Authorized request audit (v1, Phase 5): a prospective buyer or auditor granted access via authorizeUsage receives the sealed key, recomputes sha256(reqBody) for any past entry, and confirms it equals the on-chain reqSha and that the body embeds strategy H. Verification without public leakage. This turns pre-purchase due diligence into a product feature.
2. ZK prefix opening (extension, Phase 8 candidate): a SHA-256 partial-preimage proof that reqBody begins with COMMIT_LINE and contains commitment H, without revealing the strategy segment. Groth16/BN254 territory Tim already owns. Until it ships, the public claim is the narrowed v1 claim in section 2, which is fully provable.

Renter-facing security does not depend on the limitation: a renter verifies that decisions they pay for are genuine TEE outputs bound to the token they rented, and can demand audit access before renting.

TeeTLS providers (centralized upstreams) are excluded in v1: the model there is not inside the TEE. v1 pins TeeML providers only (additionalInfo.ProviderType == decentralized) with teeSignerAcknowledged == true. The expected signer is read live on-chain via InferenceServing.getService(provider).teeSignerAddress (P0.3 confirmed 2026-08-19), so the earlier pin-with-evidence fallback is now needed only for the no-mainnet-provider narrowing (testnet Compute + RecordBook on mainnet, allowed by the brief) or for separated-decentralized providers (off-chain TargetTeeAddress override). EXEC gate P0.2 still confirms at least one live TeeML chatbot provider is reachable on mainnet.

Stronger than the reference SDK (SRC, confirmed 2026-08-19): 0G's own processResponse does NOT recompute the hashes; it trusts the provider-returned text field and only ecrecovers it against getService().teeSignerAddress. RecordBook recomputes sha256(respData) on-chain (precompile) and rebuilds the 129-byte text from (reqSha, respSha) before ecrecover, so a provider that returns a text not matching the actual request/response bytes passes the SDK but fails Fief. Fief's on-chain check is strictly stronger than 0G's client verification. Headline claim.

---

## 5. Contract specification

### FiefAgent (extends pinned AgentNFT)
- mint(bytes[] proofs, string[] dataDescriptions, address to) per the draft (payable). Each proof element must be exactly 32 bytes; the permissive verifier casts it directly to a dataHash. Fief passes proofs = [H, storageRoot] as two 32-byte elements: H = keccak256(canonical strategy JSON), storageRoot = 0G Storage merkle root of the AES-256-GCM encrypted blob. There is no separate storageRoot parameter (correction 2026-08-19).
- setOperator(tokenId, address): owner-only. Operator is the runtime EOA allowed to submit entries. OperatorChanged event. Compromise recovery = rotate operator, epoch unaffected.
- reseal(tokenId, newH, newRoot): owner-only, increments epoch, emits EpochAdvanced. Old entries remain bound to old (H, epoch), no inheritance.
- authorizeUsage(uint256 tokenId, address to): the DRAFT signature has NO permissions bytes (correction 2026-08-19). The grant <-> token mapping lives in RentalDesk (keyed by tokenId + renter); grantId is never encoded through authorizeUsage. FiefAgent may add an owner-only authorizeUsageWithGrant wrapper later if a permissions payload is needed.
- transfer(address to, uint256 tokenId, bytes[] proofs): NO explicit sealedKey parameter (correction 2026-08-19). The sealedKey (bytes16) is parsed from proof bytes (bytes16(proof[178:190])) and surfaced via emit PublishedSealedKey. Draft verifyTransferValidity enforces ONLY a receiver ECDSA signature (recovered == to) + replay nonce, not a TEE/ZKP proof. Record is stored in RecordBook keyed by tokenId, untouched by transfer.
- License (corrected 2026-08-19): AgentNFT.sol and Verifier.sol are MIT (repo LICENSE.md = CC0-1.0; only IERC7857.sol + the beacon proxies are GPL-3.0). Fief's contracts package is MIT. If the GPL-3.0 IERC7857.sol interface is vendored verbatim its header stays; prefer re-declaring the interface to keep the package uniformly MIT. Recorded in DECISIONS.md.

### RecordBook
State: per tokenId: epoch, lastNonce, entries (append-only array of Entry), operator (read from FiefAgent), pinned provider set.

Entry: { respSha, reqSha, provider, teeSigner, nonce, epoch, inputHash, renter, decisionDigest, blockTime }.

recordDecision(uint256 tokenId, bytes respData, bytes32 reqSha, bytes sig, address provider, bytes32 inputHash, address renter, uint32 commitOffset):
1. msg.sender == operator(tokenId)
2. respSha = sha256(respData) (precompile)
3. text = hex(reqSha) ":" hex(respSha) as exactly 129 ASCII bytes; digest = EIP-191 personal hash (prefix "\x19Ethereum Signed Message:\n129"); signer = ecrecover(digest, sig)
4. require signer == expectedTeeSigner(provider) AND getService(provider).teeSignerAcknowledged (staticcall, see expectedTeeSigner below)
5. respData is the provider's OpenAI-style chat-completion JSON envelope (confirmed by the P0.2 seam), so the echoed commitment lives inside choices[0].message.content and is NOT at offset 0. The contract does not slice at 0; it BUILDS the expected bytes from its own state + the (inputHash, renter) args and asserts they appear at the head of the message content:
     EXP = `"content":"` || `FIEFv1|book:` || hexAddr(address(this)) || `|chain:16661|agent:` || dec(tokenId) || `|epoch:` || dec(epoch) || `|nonce:` || dec(lastNonce+1) || `|strategy:` || hexBytes32(H(tokenId,epoch)) || `|input:` || hexBytes32(inputHash) || `|renter:` || hexAddr(renter)
   Require respData[commitOffset .. commitOffset+EXP.length] == EXP (one memcmp; equivalently keccak(slice) == keccak(EXP)). The leading `"content":"` anchor pins the commit line to the START of the assistant message content; the exact byte-match of book/chain/agent/epoch/nonce/strategy/input/renter enforces provenance and the nonce replay guard. No JSON parsing on-chain, only a memcmp at a caller-supplied offset that the compare fully validates: a wrong offset, inputHash, or renter simply reverts, because EXP is derived from on-chain state and cannot be forged into a TEE-signed respData.
   Canonical, fixed-width encodings (must match the runtime byte-for-byte): addresses = 42-char 0x-lowercase (null renter = the zero address, never "0x0"); bytes32 = 66-char 0x-lowercase; tokenId/epoch/nonce = decimal ASCII. COMMIT_LINE contains no JSON-escapable characters (no '"', '\', control chars), so its bytes are identical inside the JSON string envelope.
6. store Entry{ respSha, reqSha, provider, signer, nonce=lastNonce+1, epoch, inputHash, renter, decisionDigest=keccak(respData), blockTime }; lastNonce++; emit DecisionRecorded(green)
Rejections revert with typed errors (NotOperator | BadSigner | BadAnchor | BadCommit | BadNonce | BadEpoch | BadHash); the runtime also calls a view preflight, and the demo's red transaction uses a recordDecisionStrict variant that emits DecisionRejected instead of reverting, so the failure is a visible on-chain event (design choice for judge legibility, documented). commitOffset and the anchor are untrusted inputs; security rests on the EXP memcmp (EXP built purely from on-chain state + args), the anchor only ensures the commitment sits at the head of the assistant message content.

expectedTeeSigner(provider): staticcall InferenceServing.getService(address provider) on 0x4734...8d84 and read Service.teeSignerAddress; require Service.teeSignerAcknowledged == true (P0.3 RESOLVED 2026-08-19, getter ABI confirmed from SDK bindings). The pinSigner(provider, signer, evidenceURI) admin path is retained only as (a) an override for separated-decentralized providers whose authoritative signer is the off-chain additionalInfo.TargetTeeAddress, and (b) the pre-approved narrowing if mainnet Compute is unreachable and Compute runs on testnet. When pinned, the claim language shifts from "read live from 0G's contract" to "pinned from 0G's attestation, evidence linked".

### RentalDesk
- list(tokenId, feePerDecisionWei, minEscrow): owner-only.
- rent(tokenId) payable: creates grant { renter, expiry, maxDecisions, remainingEscrow } keyed by (tokenId, renter) in RentalDesk state, then calls FiefAgent.authorizeUsage(tokenId, renter) (draft 2-arg form; grantId is NOT passed on-chain, correction 2026-08-19).
- settle(tokenId, entryIndices[]): pulls feePerDecision per Accepted entry whose renter field matches the grant, pays current owner minus 200 bps protocol fee, decrements escrow. Pull pattern, no push transfers.
- cancel/expire: renter reclaims unspent escrow after expiry.
- Conservation invariant enforced: escrowed == settled + refunded + remaining, checked in tests against the reference model.
- Transfer semantics: grants survive transfer until expiry; settlement pays owner at settlement time. Recorded in DECISIONS.md.

---

## 6. State machines

Agent: Drafted -> Sealed (blob on Storage, H fixed) -> Minted -> Active -> Listed -> Rented (0..n concurrent grants) -> Resealed (epoch+1, back to Active) -> Transferred (record persists) -> Retired (owner stops operator; record remains readable forever).

Entry: Produced (runtime) -> Preflighted -> Submitted -> Accepted | Rejected(reason: BadSigner | BadNonce | BadEpoch | BadCommit | BadHash | NotOperator). Accepted entries are immutable.

Rental: Listed -> Escrowed -> Active(expiry, allowance) -> Consuming (settle per entry) -> Expired | Revoked -> Refunded remainder.

Transfer: Initiated -> ProofPosted(bytes[] proofs) -> verifyTransferValidity (draft checks ONLY: receiver ECDSA sig recovered == to, plus replay nonce; NO TEE/ZKP proof) -> OwnershipMoved + PublishedSealedKey(bytes16 sealedKey sliced from proof[178:190]). Failure reverts atomically (draft contract behavior, confirmed in P0.5, rehearsed in P4). Fief claims no cryptographic re-encryption guarantee from the draft verifier.

---

## 7. Invariants

- I1 Every Accepted entry passed on-chain signature recovery to the expected TEE signer.
- I2 Nonces per (tokenId, epoch) are strictly increasing, no gaps accepted, no duplicates.
- I3 The record is append-only. Transfer, rental, and reseal never mutate existing entries.
- I4 Sealed key material and strategy plaintext never appear in calldata, events, logs, API responses, client bundles, or error messages.
- I5 Rental conservation: escrowed == settled + refunded + remaining, always.
- I6 Reseal starts a new epoch; entries never cross epochs.
- I7 authorizeUsage never exposes the sealed key; renters interact only with the runtime feed. Audit access is a distinct, owner-signed key-sealing action, logged.
- I8 respSha stored on-chain always equals sha256 of the archived public respData on Storage.
- I9 Only the registered operator can append entries for a token.
- I10 Every public claim in README and submission copy maps to a row in the claims ledger at its proven rung or lower.

---

## 8. Public/private boundary

| Field | Private forever | Private until audit grant | Public at recording | Public at settlement |
|---|---|---|---|---|
| Strategy plaintext, sealed key | x | | | |
| reqBody | | x (sealed-key audit only) | | |
| reqSha | | | x | |
| respData (COMMIT_LINE + decision) | | | x | |
| inputHash + archived snapshot | | | x | |
| TEE signer, provider address | | | x | |
| P&L derived from decisions | | | x | |
| Rental terms, renter address | | | x | x |

Precise language, enforced in all copy: "strategy sealed on 0G Storage, never on the public chain", "decisions attested by 0G TeeML", "request commitment sealed, auditable under authorized access". Never: "trustless", "unextractable", "impossible to fake". Distillation of a strategy from long observation of its outputs is a documented residual risk, mitigated by rate limits and delayed public reveal options, not denied.

---

## 9. Threat model

| Threat | Vector | Mitigation |
|---|---|---|
| Forged receipt | attacker signs with own key | I1: on-chain ecrecover over the recomputed 129-byte text must equal getService(provider).teeSignerAddress with teeSignerAcknowledged == true |
| Record graft | receipt from other model/agent | COMMIT_LINE slice checks + I9 |
| Replay | resubmit old receipt | I2 nonce + book address + chainId in line |
| Cross-deployment replay | same receipt, other RecordBook | book:<addr> field in line |
| Dishonest owner fakes H usage | request without strategy echoes H | documented limit, audit grants (5.1), ZK opening roadmap; claim narrowed accordingly |
| Operator key theft | attacker appends junk | setOperator rotation, entries flagged post-hoc impossible so rotate fast; alerting in runtime |
| Strategy theft via API | leakage paths | I4 tests: scan calldata, events, API snapshots, bundles in CI |
| Renter distillation | copy behavior from outputs | rate limits, disclosure-delay option, documented residual |
| Escrow griefing | spam settles, dust | pull pattern, reference-model rounding, min fee |
| Wash record | owner self-inflates volume | record proves provenance, not alpha; P&L context shown, non-goal stated |
| Oracle transfer forgery | fake re-encryption proof | draft verifyTransferValidity checks ONLY receiver ECDSA sig (recovered==to) + replay nonce; TEE/ZKP proof is a // TODO stub, attestationContract unused (SRC 2026-08-19). P0.5 documents this; Fief never claims oracle/re-encryption strength beyond it; record integrity is independent of transfer (RecordBook keyed by tokenId) |
| Prompt injection via snapshot | market data as instructions | snapshot canonicalized to numeric JSON, no free text reaches the model |
| Admin abuse | pinSigner misuse | admin actions evented, evidence URI mandatory, listed in SECURITY.md |

---

## 10. Failure recovery

- Provider down or 429: failover to next pinned TeeML provider; receipts queue locally with their nonces; submission window generous (no on-chain freshness requirement in v1, nonce ordering suffices).
- Signature endpoint returns nothing for chatID: retry with backoff; if unrecoverable, decision is discarded before nonce consumption (nonce assigned at successful signature fetch, not at request time).
- Tx failure: idempotent resubmit, same payload; nonce gap impossible because nonce is assigned in order of successful local verification.
- Batch fee settlement drains sub-account mid-run: runtime monitors getAccount, auto-tops from ledger (Node auto-funding, DOC), alert below threshold.
- Storage upload failure: chain entry still lands (respData is in calldata); snapshot archival retries; I8 checked by a reconciliation job.
- Oracle transfer failure: draft contract reverts; retry; documented.

---

## 11. Reference model (packages/reference)

Pure TypeScript, zero chain deps. Exports: buildCommitLine, buildExpectedCommit (the `"content":"` + COMMIT_LINE bytes the contract rebuilds), findCommitOffset (locate the anchor in an envelope), canonicalRequest, canonicalSnapshot, signedText, verifyReceipt, applyEntry, settle, reseal, transfer, authorize. Property tests (fast-check) plus exhaustive enumeration of the rental settlement state space (small). Mandatory cases: nonce monotonicity and gap rejection, duplicate rejection, epoch isolation across reseal, conservation with dust and zero-fee, max allowance, revoke mid-consumption, transfer mid-rental, empty and max-size respData, malformed commit lines (every field mutated), commit line embedded in an OpenAI JSON envelope at a non-zero offset (correct commitOffset accepted; wrong offset, missing/late `"content":"` anchor, and a decoy earlier `"content":"` field all rejected), canonical fixed-width encodings (42-char address incl. zero-address renter never "0x0", 66-char bytes32, decimal ids) with a mismatched inputHash or renter arg rejected, signature v 27/28 both, wrong signer, boundary hex casing. Fixture generator emits JSON vectors consumed by Foundry tests. Contract tests must import fixtures, never restate expected values.

---

## 12. Runtime specification

- Node 22, TypeScript, single process, pm2 on VPS. Wallets: operator EOA (records, hot, low balance) and treasury (cold). Compute ledger funded 3 OG minimum plus 1 OG per pinned provider (DOC; owner-funded 2026-08-19, not a gate). Judge reproduction never depends on these keys: fixtures plus testnet path in SETUP.md.
- Storage adapter: 0G Storage via @0glabs/0g-ts-sdk (DEPRECATED on npm; P0.4 confirms it still round-trips or swaps to the maintained successor / Indexer HTTP API). The SDK does NOT encrypt; Fief encrypts AES-256-GCM before upload and computes/records the merkle rootHash via file.merkleTree().rootHash().
- Strategy container v1: canonical JSON { version, model params (temperature 0), systemPrompt (strategy logic + output contract that mandates COMMIT_LINE echo as line one), riskParams, featureConfig }. H = keccak256(JCS canonical bytes). Encrypted AES-256-GCM, key sealed to owner pubkey (ECIES), blob to 0G Storage.
- Canonical request builder: exact byte layout fixed and unit-tested against sha256 vectors; broker must hash the same bytes we hash (EXEC gate P0.2 confirms no proxy mutation by matching our sha256(reqBody) to the signed text prefix).
- Decision loop: snapshot -> request -> inference -> output-contract validation (line one equals COMMIT_LINE byte-exact, else one retry then discard) -> signature fetch -> local verify -> submit -> archive respData + snapshot to Storage.
- Renter feed: authenticated SSE/webhook per grant, each message references its on-chain entry index so renters verify independently.

---

## 13. Economics

Rental fee per decision set by owner in OG wei. Protocol fee 200 bps. Costs: mainnet gas (recordDecision estimated well under 200k gas: one sha256 of <=512B, one ecrecover, one staticcall, storage write; measured in P3), compute inference fees (DOC ~0.003 USD per 1k tokens scale), storage dust. Cadence at one decision per 5 minutes stays far inside 30/min rate limits.

---

## 14. Proof ladder and claims ledger

Rungs: 1 reference model, 2 unit/property, 3 adversarial, 4 real SDK against live provider locally, 5 testnet composed, 6 mainnet deployment, 7 mainnet composed tx (green + red), 8 browser flow, 9 read-only independent verifier. claims.yaml rows: { claim, rung, evidence (tx/test/file), network, date, status: verified|failed|reported }. CI job fails if README numbers drift from ledger. Never counted as evidence: deployed-but-unused contracts, mocked calls, predicted gas, local runs presented as public.

---

## 15. Repo and judge path

Public repo baseline per house standard: README, ARCHITECTURE.md (mermaid), SECURITY.md (threat model + honest limits), DECISIONS.md, SETUP.md, CONTRIBUTIONS.md, claims.yaml, LICENSE (MIT; the AgentNFT/Verifier fork is MIT and the reference repo dedication is CC0-1.0, so only the vendored IERC7857 interface + beacon proxies carry GPL-3.0, prefer re-declaring the interface to stay uniformly MIT). `/internal/` gitignored.

README first screen, in order: one-liner; the mechanism sentence; live app link; 60s clip; network = 0G mainnet 16661; the green tx and the red tx; `pnpm fief-verify --tx <green>`; honest status block. Two-minute judge path: proof page -> record with green/red -> two ChainScan links -> one verify command -> clip. No key needed for read-only.

CONTRIBUTIONS.md targets: (a) TeemlReceiptVerifier.sol published as a standalone reusable library with an upstream PR or issue to @0gfoundation/0g-compute-ts-sdk proposing an on-chain verification example (note: the SDK's own processResponse only ecrecovers the provider-returned text, so an on-chain recompute example is genuinely additive), (b) issue on 0g-agent-nft documenting the permissive draft verifier respectfully: verifyPreimage hardcodes isValid=true after only a 32-byte length check, verifyTransferValidity leaves the TEE/ZKP proof as a // TODO (bool isValid=true) and never reads attestationContract, with a concrete suggested check for each, (c) starter-kit example if accepted.

---

## 16. Phased implementation gates

Phase order is live-core-first. No phase starts before the previous gate passes. Each phase ends with a commit, updated claims.yaml, and a stop.

### P0 - Day 0: admin + seam spikes (target: 1 day)
Scope (2026-08-19 status folded in; several sub-gates pre-resolved by the verification pass, section 0.5):
- P0.0 DONE: Wave 3 submit deadline = 2026-08-30 16:00. Remaining human action: register on AKINDO, join 0G Discord/TG.
- P0.1 RELAXED: mainnet OG is owner-funded, not a blocker. Just fund the ledger (3 OG) + one provider sub-account (1 OG).
- P0.2 LIVE STEP REMAINING: list mainnet services, pick a TeeML decentralized chatbot provider with teeSignerAcknowledged==true, fund sub-account, run one inference with a canonical body, GET /v1/proxy/signature/{chatID}?model={model}, reproduce the 129-byte text and recover the signer. Endpoint/format/scheme/JSON are already SRC-confirmed; the ONLY unknowns left are (i) sha256(our exact canonical reqBody) == the returned text prefix (no broker proxy mutation), and (ii) recovered signer == getService(provider).teeSignerAddress.
- P0.3 DONE: expected signer = InferenceServing.getService(address).teeSignerAddress (+ teeSignerAcknowledged), read live on-chain; pin path only for separated providers.
- P0.4 LIVE STEP + DEPRECATION CHECK REMAINING: upload/download/decrypt one AES-256-GCM blob via @0glabs/0g-ts-sdk and match rootHash; also confirm the DEPRECATED SDK still round-trips against current 0G Storage, else switch to the successor / Indexer HTTP API.
- P0.5 DEPLOY REMAINING: contracts, mint(bytes[],string[],address), transfer(to,tokenId,bytes[]), authorizeUsage(tokenId,to) and the permissive verifier are already SRC-read; build the pinned eip-7857-draft repo, deploy to testnet 16602, exercise mint + authorizeUsage + transfer with repo scripts, and record exactly what verifyTransferValidity enforces (receiver sig + replay nonce only).
Evidence: a seam report in /internal/ with raw artifacts; claims.yaml rows at rung 4.
Completion gate: P0.2 live inference green with our-bytes hash match AND signer == getService().teeSignerAddress; P0.4 blob round-trip + rootHash match (or successor adopted); P0.5 mint+authorize green on testnet (transfer carries the documented permissive-verifier caveat). P0.0/P0.1/P0.3 already resolved.
Stop boundary: no product code. Remaining kill/pivot triggers (narrowed after section 0.5): our canonical reqBody bytes are mutated by the broker so sha256 never matches the signed-text prefix and cannot be reconciled; no TeeML provider reachable on mainnet or testnet after DevRel escalation; @0glabs/0g-ts-sdk fails and no successor round-trips (low risk, blob is small).

### P1 - Reference model (1 day)
Scope: packages/reference complete with fixtures. Files: packages/reference/src/*, fixtures/*.json.
Evidence: full property/enumeration suite green in CI; fixture vectors committed.
Gate: every section 11 case covered. Stop: no Solidity yet.

### P2 - Core contracts local (2 days)
Scope: TeemlReceiptVerifier, RecordBook, FiefAgent fork, Foundry tests importing P1 fixtures, adversarial suite (every threat-table row that is contract-addressable), gas snapshot for recordDecision.
Evidence: forge test green, gas report, mutation of each COMMIT_LINE field rejected.
Gate: adversarial suite green against fixtures. Stop: no deployment.

### P3 - Runtime + local end-to-end (2 days)
Scope: runtime decision loop against the P0 provider, one real strategy container sealed, full loop on testnet 16602: real inference -> real signature -> on-chain accept, plus a deliberate tampered submit rejected.
Evidence: testnet green and red txs; I4 leakage scan in CI.
Gate: rung 5 for the core claim. Stop: no mainnet, no UI.

### P4 - Mainnet minimum complete live transaction (1 day) [Wave 3 core]
Scope: deploy contracts to 16661, mint agent 1 (sealed strategy on Storage), record first real decisions, produce the canonical green and red transactions, verifier CLI reads them, proof page stub, transfer rehearsal on testnet documented.
Evidence: ChainScan links, `fief-verify` output, claims.yaml rungs 6-7-9.
Gate: section 2 claim fully evidenced. Stop: extensions still frozen.

### P5 - Wave 3 submission package (1-2 days)
Scope: README first screen, video (<=3 min, screenplay below), X post per mandatory format, AKINDO submission fields, cold adversarial audit pass over the repo plus cross-model review, clean-clone reproduction test.
Gate: submission filed before the confirmed deadline. Stop: nothing new after code freeze.

### P6 - Rental end-to-end (Wave 4)
Scope: RentalDesk live, authorizeUsage wired, renter feed, settle path, audit-grant flow (sealed-key re-seal to auditor, reqSha recomputation script), web rent flow from a second wallet.
Adversarial: settle replay, expiry edge, conservation on-chain vs reference.
Gate: a real rental with N settled decisions on mainnet from a wallet that is not the deployer.

### P7 - Live agents + record depth (Wave 4)
Scope: adapters piping the Delphi/OKX decision streams through the runtime; leaderboard and P&L context on record pages; second and third agents minted.
Gate: multi-day continuous record on mainnet, zero rejected-for-bug entries.

### P8 - Wave 5: marketplace polish + one deep extension
Scope: listings UX, third-party onboarding doc, Token2049 demo assets; single deep-extension slot, first candidate the ZK prefix-opening spike (admits under the feature gate: strengthens the mechanism, removes the section 4.1 objection). Admit only if P6/P7 are stable.

---

## 17. Demo screenplay (pre-committed, <=3 min)

1. 0:00 problem: a real-looking bot listing with a fabricated backtest. One line: you cannot verify any of this. (10s)
2. 0:10 an agent decides live: snapshot in, 0G Compute inference, decision out, green entry lands on ChainScan. Camera on the COMMIT_LINE match. (40s)
3. 0:50 the graft: one byte changed, resubmitted, red rejection event on-chain. (25s)
4. 1:15 rental: second wallet rents, receives verified decisions, opens the strategy blob, sees ciphertext. (40s)
5. 1:55 audit grant: auditor recomputes reqSha for a past entry, matches on-chain. (25s)
6. 2:20 transfer: agent sold, record intact under new owner, new decisions continue the same ledger. (25s)
7. 2:45 close: verify command on screen, counter of live brain-bound decisions. (15s)
Sound-off contrast: green vs red vs ciphertext.

## 18. X post template (mandatory elements)

Fief - rent a trading agent whose track record is signed by its own sealed brain. Strategy never leaks. Live on 0G mainnet: [green tx] vs [red tx]. [clip] #0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io

---

## 19. Non-goals (v1, explicit)

No custody or execution of renter funds. No claim of alpha or P&L verification (provenance only). No token. No governance. No secondary-market royalties. No TeeTLS providers. No ZKML/OPML claims. No multi-chain. No claim of trustlessness for the ERC-7857 oracle beyond what the draft verifier enforces.

## 20. Kill criteria and pre-approved narrowings

Updated 2026-08-19 after the section 0.5 verification pass. Signature format, endpoint, scheme, and the getService signer read are now SRC-confirmed, so the first three triggers are largely retired; what remains is a live-behavior check.
- Broker mutates our canonical reqBody so sha256(our bytes) never equals the returned text prefix, and it cannot be reconciled in P0.2: stop, escalate DevRel, else pivot per Mode A runner-up. (Format/endpoint/scheme are confirmed; this is the only signature-seam risk left.)
- No usable TeeML provider anywhere (mainnet or testnet) after DevRel escalation: same.
- Cross-contract signer read: RESOLVED (getService(address).teeSignerAddress + teeSignerAcknowledged). Pinned-signer-with-evidence is retained only for separated-decentralized providers or the testnet-Compute narrowing below.
- Mainnet Compute unusable but testnet fine: RecordBook on mainnet, Compute on testnet, stated plainly (brief allows it).
- Draft oracle transfer: verifyTransferValidity is permissive (receiver sig + replay nonce only, no TEE/ZKP proof, attestationContract unused). Not a kill trigger, a documented limit: demo transfer on testnet, claim narrowed, record integrity independent of transfer.
- Storage SDK @0glabs/0g-ts-sdk is DEPRECATED on npm: if it fails against current 0G Storage, adopt the maintained successor / Indexer HTTP API. Low risk, the sealed blob is small.
