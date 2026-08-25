// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Bytes} from "./lib/Bytes.sol";
import {TeemlReceiptVerifier} from "./TeemlReceiptVerifier.sol";
import {IInferenceServing} from "./interfaces/IInferenceServing.sol";
import {FiefAgent} from "./FiefAgent.sol";
import {EpochBook} from "./EpochBook.sol";

/// @title RecordBook
/// @notice Commit/reveal decision lifecycle and byte-exact receipt verification.
///
/// @dev Two phases, and the split is the product rather than an implementation
///      detail (PRD v2 §4.2). v1 published the decision in calldata the instant
///      the inference happened, which meant nobody needed to rent anything:
///      they could just watch this contract. Here `commitDecision` publishes a
///      sealed, timely, direction-free commitment; renters receive the
///      cleartext immediately off-chain; `revealDecision` opens it once the
///      market horizon has passed and the edge has decayed.
contract RecordBook {
    using Bytes for bytes;

    struct Commit {
        bytes32 reqSha;
        bytes32 respSha;
        bytes32 receiptCommit;
        address provider;
        uint64 committedAt;
    }

    /// @notice The joined view of a revealed slot, for consumers and indexers.
    struct Entry {
        bytes32 reqSha;
        bytes32 respSha;
        address provider;
        address teeSigner;
        bytes32 inputHash;
        address renter;
        bytes32 decisionDigest;
        uint64 revealedAt;
    }

    /// @dev What is actually stored. `reqSha`, `respSha` and `provider` already
    ///      live in the slot's `Commit` under the same key, so persisting them
    ///      again cost four extra SSTOREs per reveal for nothing. `entryOf`
    ///      rebuilds the full `Entry` by joining the two.
    struct StoredEntry {
        address teeSigner;
        uint64 revealedAt;
        bytes32 inputHash;
        address renter;
        bytes32 decisionDigest;
    }

    FiefAgent public immutable agents;
    EpochBook public immutable epochs;
    IInferenceServing public immutable serving;
    uint256 public immutable chainId;

    /// @dev agentId => epochId => slot => record
    mapping(uint256 => mapping(uint64 => mapping(uint32 => Commit))) private _commits;
    mapping(uint256 => mapping(uint64 => mapping(uint32 => StoredEntry))) private _entries;

    /// @dev Overrides the live `getService` read for separated-decentralized
    ///      providers, and for the pre-approved narrowing where Compute runs on
    ///      testnet while this contract is on mainnet (PRD v2 §20). Admin-only
    ///      and evented, because it weakens the "read live from 0G" claim to
    ///      "pinned from 0G's attestation, evidence linked".
    mapping(address => address) public pinnedSigner;
    address public immutable admin;

    event DecisionCommitted(
        uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, bytes32 receiptCommit
    );
    event DecisionRevealed(
        uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, address teeSigner
    );
    event DecisionRejected(
        uint256 indexed agentId, uint64 indexed epochId, uint32 indexed slot, string reason
    );
    event SignerPinned(address indexed provider, address indexed signer, string evidenceURI);

    error NotOperator();
    error NotAdmin();
    error EpochNotOpen();
    error UnknownSlot();
    error SlotDeadlinePassed();
    error SlotAlreadyCommitted();
    error ProviderNotPinned();
    error NoCommit();
    error AlreadyRevealed();
    error RevealTooEarly();
    error BadReveal();
    error BadHash();
    error BadSigner();
    error BadCommit();

    constructor(FiefAgent _agents, EpochBook _epochs, IInferenceServing _serving) {
        agents = _agents;
        epochs = _epochs;
        serving = _serving;
        chainId = block.chainid;
        admin = msg.sender;
    }

    /* --------------------------------- commit -------------------------------- */

    /// @notice Publish a sealed commitment for a scheduled slot.
    /// @dev The deadline check is invariant I12 and is the single line that
    ///      makes late commits impossible. Without it an operator could wait to
    ///      see the outcome before deciding whether to record the call, which
    ///      is the attack v1 was open to.
    function commitDecision(
        uint256 agentId,
        uint64 epochId,
        uint32 slot,
        bytes32 reqSha,
        bytes32 respSha,
        bytes32 receiptCommit,
        address provider
    ) external {
        if (agents.operatorOf(agentId) != msg.sender) revert NotOperator();
        if (!epochs.isOpen(agentId, epochId)) revert EpochNotOpen();

        EpochBook.EpochSpec memory spec = epochs.specOf(agentId, epochId);
        if (slot >= spec.slotCount) revert UnknownSlot();
        if (_commits[agentId][epochId][slot].committedAt != 0) revert SlotAlreadyCommitted();
        if (block.timestamp > epochs.slotCommitDeadline(agentId, epochId, slot)) {
            revert SlotDeadlinePassed();
        }
        if (!epochs.isPinnedProvider(agentId, epochId, provider)) revert ProviderNotPinned();

        _commits[agentId][epochId][slot] =
            Commit(reqSha, respSha, receiptCommit, provider, uint64(block.timestamp));
        epochs.noteCommitted(agentId, epochId);

        emit DecisionCommitted(agentId, epochId, slot, receiptCommit);
    }

    /* --------------------------------- reveal -------------------------------- */

    struct RevealArgs {
        uint256 agentId;
        uint64 epochId;
        uint32 slot;
        bytes respData;
        bytes signature;
        uint32 commitOffset;
        bytes32 inputHash;
        address renter;
        bytes32 salt;
    }

    /// @notice Open a commitment and verify it byte-exact.
    /// @dev Permissionless on purpose. The renter already holds the plaintext,
    ///      so an owner who sits on a losing call cannot bury it (PRD v2 §9,
    ///      "selective reveal").
    function revealDecision(RevealArgs calldata a) external {
        Commit memory c = _commits[a.agentId][a.epochId][a.slot];
        if (c.committedAt == 0) revert NoCommit();
        if (_entries[a.agentId][a.epochId][a.slot].revealedAt != 0) revert AlreadyRevealed();
        if (block.timestamp < epochs.slotRevealOpen(a.agentId, a.epochId, a.slot)) {
            revert RevealTooEarly();
        }

        // Every failure below reverts and changes nothing. Reveal is
        // permissionless, so a failed reveal must NOT burn the slot: otherwise
        // anyone could destroy an honest agent's completeness by spamming
        // garbage reveals. A slot that is committed but never successfully
        // revealed is counted invalid at finalize, derived from the counters.

        // 1. the reveal must open exactly the commitment that was published (I14)
        bytes32 recomputed = keccak256(
            abi.encode(a.respData, a.signature, a.commitOffset, a.inputHash, a.renter, a.salt)
        );
        if (recomputed != c.receiptCommit) revert BadReveal();

        // 2. the response bytes must hash to what was committed
        (address signer, bytes32 respSha) =
            TeemlReceiptVerifier.recover(a.respData, c.reqSha, a.signature);
        if (respSha != c.respSha) revert BadHash();

        // 3. the recovered enclave key must be the one 0G has registered
        address expected = expectedTeeSigner(c.provider);
        if (signer == address(0) || expected == address(0) || signer != expected) {
            revert BadSigner();
        }

        // 4. the signed response must contain the commitment THIS contract expects
        bytes memory exp = expectedCommitBytes(
            a.agentId, a.epochId, a.slot, agents.strategyHashOf(a.agentId), a.inputHash, a.renter
        );
        if (!Bytes.equalsAt(a.respData, exp, a.commitOffset)) revert BadCommit();

        _entries[a.agentId][a.epochId][a.slot] = StoredEntry({
            teeSigner: signer,
            revealedAt: uint64(block.timestamp),
            inputHash: a.inputHash,
            renter: a.renter,
            decisionDigest: keccak256(a.respData)
        });
        epochs.noteRevealed(a.agentId, a.epochId);

        emit DecisionRevealed(a.agentId, a.epochId, a.slot, signer);
    }

    /// @notice Demo variant: emits `DecisionRejected` instead of reverting.
    /// @dev Wave 3's red transaction has to be legible on ChainScan, and a
    ///      reverted tx shows as a failure rather than as a contract decision.
    ///      This is a judge-legibility affordance, documented as such, and is
    ///      never used by the runtime. It writes no state for the same
    ///      anti-griefing reason as above.
    function revealDecisionStrict(RevealArgs calldata a) external returns (bool ok) {
        try this.revealDecision(a) {
            return true;
        } catch (bytes memory err) {
            emit DecisionRejected(a.agentId, a.epochId, a.slot, _reasonOf(err));
            return false;
        }
    }

    function _reasonOf(bytes memory err) private pure returns (string memory) {
        if (err.length < 4) return "unknown";
        bytes4 sel;
        assembly {
            sel := mload(add(err, 0x20))
        }
        if (sel == BadReveal.selector) return "BadReveal";
        if (sel == BadHash.selector) return "BadHash";
        if (sel == BadSigner.selector) return "BadSigner";
        if (sel == BadCommit.selector) return "BadCommit";
        if (sel == RevealTooEarly.selector) return "RevealTooEarly";
        if (sel == NoCommit.selector) return "NoCommit";
        if (sel == AlreadyRevealed.selector) return "AlreadyRevealed";
        return "unknown";
    }

    /* ------------------------------ commit bytes ----------------------------- */

    /// @notice Rebuild the exact bytes the TEE-signed response must contain.
    /// @dev Derived purely from on-chain state plus the two caller arguments, so
    ///      it cannot be forged into a signed response. `commitOffset` and the
    ///      anchor are untrusted; the memcmp is the entire security property.
    ///      The `"content":"` anchor was confirmed compact (no space) against a
    ///      live provider on 2026-08-25.
    function expectedCommitBytes(
        uint256 agentId,
        uint64 epochId,
        uint32 slot,
        bytes32 strategyHash,
        bytes32 inputHash,
        address renter
    ) public view returns (bytes memory) {
        return abi.encodePacked(
            '"content":"',
            "FIEFv1|book:",
            Bytes.hexAddress(address(this)),
            "|chain:",
            Bytes.decimal(chainId),
            "|agent:",
            Bytes.decimal(agentId),
            "|epoch:",
            Bytes.decimal(epochId),
            "|slot:",
            Bytes.decimal(slot),
            "|strategy:",
            Bytes.hexBytes32(strategyHash),
            "|input:",
            Bytes.hexBytes32(inputHash),
            "|renter:",
            Bytes.hexAddress(renter)
        );
    }

    /* -------------------------------- signers -------------------------------- */

    /// @notice The enclave key 0G has registered for this provider.
    /// @dev Live staticcall by default. Falls back to an admin pin only where
    ///      the pin was explicitly set, and a provider whose signer is not
    ///      acknowledged on-chain is treated as having none.
    function expectedTeeSigner(address provider) public view returns (address) {
        address pin = pinnedSigner[provider];
        if (pin != address(0)) return pin;

        try serving.getService(provider) returns (IInferenceServing.Service memory s) {
            if (!s.teeSignerAcknowledged) return address(0);
            return s.teeSignerAddress;
        } catch {
            return address(0);
        }
    }

    function pinSigner(address provider, address signer, string calldata evidenceURI) external {
        if (msg.sender != admin) revert NotAdmin();
        pinnedSigner[provider] = signer;
        emit SignerPinned(provider, signer, evidenceURI);
    }

    /* --------------------------------- views --------------------------------- */

    function commitOf(uint256 agentId, uint64 epochId, uint32 slot)
        external
        view
        returns (Commit memory)
    {
        return _commits[agentId][epochId][slot];
    }

    function entryOf(uint256 agentId, uint64 epochId, uint32 slot)
        external
        view
        returns (Entry memory)
    {
        StoredEntry memory e = _entries[agentId][epochId][slot];
        Commit memory c = _commits[agentId][epochId][slot];
        return Entry({
            reqSha: c.reqSha,
            respSha: c.respSha,
            provider: c.provider,
            teeSigner: e.teeSigner,
            inputHash: e.inputHash,
            renter: e.renter,
            decisionDigest: e.decisionDigest,
            revealedAt: e.revealedAt
        });
    }

    function isRevealed(uint256 agentId, uint64 epochId, uint32 slot) external view returns (bool) {
        return _entries[agentId][epochId][slot].revealedAt != 0;
    }
}
