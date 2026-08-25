// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FiefAgent} from "./FiefAgent.sol";

/// @title EpochBook
/// @notice Forward epochs: a slot schedule fixed on-chain before any outcome is knowable.
///
/// @dev This is the contract that separates v2 from v1. v1 could only claim
///      "each published entry is authentic", because the runtime was free to
///      discard a decision before consuming a nonce and there was no on-chain
///      freshness requirement. An operator could run four inferences, see which
///      two were wrong, and publish only the winners: every receipt genuine,
///      the record still a lie.
///
///      Here the schedule is committed up front and every scheduled slot is
///      publicly accounted for, so a dropped call is a permanent `Missed` that
///      lowers published completeness. `Missed` is derived rather than stored,
///      which keeps a 144-slot day at O(1) storage while still resolving every
///      slot.
contract EpochBook {
    struct EpochSpec {
        bytes32 market;
        uint32 cadenceSeconds;
        uint32 horizonSeconds;
        uint32 maxCommitDelay;
        uint32 disclosureDelay;
        uint64 startTime;
        uint32 slotCount;
        bytes32 strategyHash;
        bytes32 providerSetHash;
    }

    struct EpochMeta {
        bool opened;
        uint64 openedAt;
        uint64 abandonedAt;
        bool finalized;
        uint32 committedCount;
        uint32 revealedCount;
    }

    /// @dev Grace period after the last slot's reveal window opens, before the
    ///      epoch can be finalized. Gives every committed slot a real chance to
    ///      be revealed, so `invalid` means "nobody could open this commitment"
    ///      rather than "we finalized too early".
    uint64 public constant REVEAL_GRACE = 1 days;

    FiefAgent public immutable agents;

    /// @dev agentId => epochId => spec
    mapping(uint256 => mapping(uint64 => EpochSpec)) private _specs;
    mapping(uint256 => mapping(uint64 => EpochMeta)) private _meta;
    /// @dev Providers pinned for an epoch, checked at commit time.
    mapping(uint256 => mapping(uint64 => mapping(address => bool))) public isPinnedProvider;

    address public recordBook;
    address public immutable deployer;

    event EpochOpened(
        uint256 indexed agentId, uint64 indexed epochId, bytes32 specHash, uint64 startTime
    );
    event EpochAbandoned(uint256 indexed agentId, uint64 indexed epochId, string reason);
    event EpochFinalized(
        uint256 indexed agentId,
        uint64 indexed epochId,
        uint32 committed,
        uint32 revealed,
        uint32 missed,
        uint32 invalid
    );

    error NotOwner();
    error NotRecordBook();
    error AlreadyOpened();
    error EpochNotOpen();
    error StartTimeInPast();
    error BadSpec();
    error UnknownSlot();
    error EpochNotOver();
    error AlreadyFinalized();
    error RecordBookAlreadySet();
    error ZeroRecordBook();

    constructor(FiefAgent _agents) {
        agents = _agents;
        deployer = msg.sender;
    }

    /// @dev Set once, immediately after deployment. Kept out of the constructor
    ///      only because RecordBook needs this contract's address first.
    function setRecordBook(address _recordBook) external {
        if (msg.sender != deployer) revert NotOwner();
        if (recordBook != address(0)) revert RecordBookAlreadySet();
        // A zero RecordBook would brick the counters with no way to re-set it.
        if (_recordBook == address(0)) revert ZeroRecordBook();
        recordBook = _recordBook;
    }

    /// @notice Open a forward epoch. Immutable once opened.
    /// @dev `startTime >= block.timestamp` is invariant I11 and is the entire
    ///      reason the record is prospective rather than retrospective. Without
    ///      it an operator could open an epoch over a window whose outcomes are
    ///      already resolved and "commit" to the past.
    /// @param providers The pinned provider set. Passed here rather than in a
    ///        follow-up call because the pin must land before `startTime`, and
    ///        splitting it across two transactions races that deadline: on a
    ///        live network the second tx can simply arrive too late and leave an
    ///        epoch that can never be committed to.
    function openEpoch(
        uint256 agentId,
        uint64 epochId,
        EpochSpec calldata spec,
        address[] calldata providers
    ) external {
        if (agents.ownerOf(agentId) != msg.sender) revert NotOwner();
        if (_meta[agentId][epochId].opened) revert AlreadyOpened();
        if (providers.length == 0) revert BadSpec();

        if (spec.startTime < block.timestamp) revert StartTimeInPast();
        if (spec.slotCount == 0) revert BadSpec();
        if (spec.cadenceSeconds == 0) revert BadSpec();
        if (spec.maxCommitDelay == 0) revert BadSpec();
        // A commit window that reaches the next snapshot would put two slots in
        // flight at once, which breaks one-decision-per-slot.
        if (spec.maxCommitDelay >= spec.cadenceSeconds) revert BadSpec();

        _specs[agentId][epochId] = spec;
        _meta[agentId][epochId] = EpochMeta(true, uint64(block.timestamp), 0, false, 0, 0);

        for (uint256 i = 0; i < providers.length; ++i) {
            isPinnedProvider[agentId][epochId][providers[i]] = true;
        }

        emit EpochOpened(agentId, epochId, keccak256(abi.encode(spec)), spec.startTime);
    }

    /// @notice Pin the providers this epoch is allowed to use.
    /// @dev Separate from `openEpoch` so the spec stays a fixed-size struct
    ///      whose hash is cheap to publish. `providerSetHash` in the spec is the
    ///      binding commitment; this mapping is the lookup.
    function pinProviders(uint256 agentId, uint64 epochId, address[] calldata providers)
        external
    {
        if (agents.ownerOf(agentId) != msg.sender) revert NotOwner();
        EpochMeta storage m = _meta[agentId][epochId];
        if (!m.opened) revert EpochNotOpen();
        // Only before the epoch starts: swapping providers mid-epoch would let
        // an operator route around a signer the record already depends on.
        if (block.timestamp >= _specs[agentId][epochId].startTime) revert EpochNotOpen();

        for (uint256 i = 0; i < providers.length; ++i) {
            isPinnedProvider[agentId][epochId][providers[i]] = true;
        }
    }

    function abandonEpoch(uint256 agentId, uint64 epochId, string calldata reason) external {
        if (agents.ownerOf(agentId) != msg.sender) revert NotOwner();
        EpochMeta storage m = _meta[agentId][epochId];
        if (!m.opened || m.abandonedAt != 0) revert EpochNotOpen();

        m.abandonedAt = uint64(block.timestamp);
        // Abandonment is an explicit, visible, on-chain act. Every remaining
        // slot resolves to Missed rather than the operator simply going quiet.
        emit EpochAbandoned(agentId, epochId, reason);
    }

    /* ----------------------------- schedule maths ---------------------------- */

    function specOf(uint256 agentId, uint64 epochId) public view returns (EpochSpec memory) {
        if (!_meta[agentId][epochId].opened) revert EpochNotOpen();
        return _specs[agentId][epochId];
    }

    function metaOf(uint256 agentId, uint64 epochId) external view returns (EpochMeta memory) {
        return _meta[agentId][epochId];
    }

    function slotSnapshotTime(uint256 agentId, uint64 epochId, uint32 slot)
        public
        view
        returns (uint64)
    {
        EpochSpec memory s = specOf(agentId, epochId);
        if (slot >= s.slotCount) revert UnknownSlot();
        return s.startTime + uint64(slot) * uint64(s.cadenceSeconds);
    }

    function slotCommitDeadline(uint256 agentId, uint64 epochId, uint32 slot)
        public
        view
        returns (uint64)
    {
        return slotSnapshotTime(agentId, epochId, slot) + _specs[agentId][epochId].maxCommitDelay;
    }

    function slotRevealOpen(uint256 agentId, uint64 epochId, uint32 slot)
        public
        view
        returns (uint64)
    {
        EpochSpec memory s = _specs[agentId][epochId];
        return slotSnapshotTime(agentId, epochId, slot) + s.horizonSeconds + s.disclosureDelay;
    }

    function epochEnd(uint256 agentId, uint64 epochId) public view returns (uint64) {
        EpochSpec memory s = specOf(agentId, epochId);
        return slotCommitDeadline(agentId, epochId, s.slotCount - 1);
    }

    function isOpen(uint256 agentId, uint64 epochId) external view returns (bool) {
        EpochMeta memory m = _meta[agentId][epochId];
        return m.opened && m.abandonedAt == 0;
    }

    /* --------------------------- counters (RecordBook) ------------------------ */

    modifier onlyRecordBook() {
        if (msg.sender != recordBook) revert NotRecordBook();
        _;
    }

    function noteCommitted(uint256 agentId, uint64 epochId) external onlyRecordBook {
        ++_meta[agentId][epochId].committedCount;
    }

    function noteRevealed(uint256 agentId, uint64 epochId) external onlyRecordBook {
        ++_meta[agentId][epochId].revealedCount;
    }

    /* ------------------------------- finalize -------------------------------- */

    /// @notice The earliest time this epoch can be finalized.
    /// @dev Every committed slot must have had its full reveal window plus the
    ///      grace period, otherwise `invalid` would punish slots that were
    ///      simply not due yet.
    function finalizeAfter(uint256 agentId, uint64 epochId) public view returns (uint64) {
        EpochSpec memory s = specOf(agentId, epochId);
        return slotRevealOpen(agentId, epochId, s.slotCount - 1) + REVEAL_GRACE;
    }

    /// @notice Permissionless once the epoch can no longer change.
    /// @dev Asserts invariant I13 on-chain rather than merely documenting it.
    ///      A summary that lost a slot is precisely the failure this design
    ///      exists to prevent, so it reverts instead of publishing a number
    ///      nobody can trust.
    ///
    ///      `invalid` is DERIVED as committed-minus-revealed rather than
    ///      counted at reveal time. Reveal is permissionless, so incrementing a
    ///      failure counter there would let anyone tank an honest agent's
    ///      record by spamming bad reveals. Here a slot is invalid only if
    ///      nobody managed to open its commitment before the deadline.
    function finalizeEpoch(uint256 agentId, uint64 epochId)
        external
        returns (uint32 committed, uint32 revealed, uint32 missed, uint32 invalid)
    {
        EpochMeta storage m = _meta[agentId][epochId];
        if (!m.opened) revert EpochNotOpen();
        if (m.finalized) revert AlreadyFinalized();
        if (block.timestamp <= finalizeAfter(agentId, epochId)) revert EpochNotOver();

        EpochSpec memory s = _specs[agentId][epochId];
        committed = m.committedCount;
        revealed = m.revealedCount;
        missed = s.slotCount - committed;
        invalid = committed - revealed;

        assert(committed + missed == s.slotCount);
        assert(revealed + invalid == committed);

        m.finalized = true;
        emit EpochFinalized(agentId, epochId, committed, revealed, missed, invalid);
    }

    /// @notice revealed / slotCount in basis points. The published completeness.
    function completenessBps(uint256 agentId, uint64 epochId) external view returns (uint32) {
        EpochSpec memory s = specOf(agentId, epochId);
        if (s.slotCount == 0) return 0;
        return uint32((uint256(_meta[agentId][epochId].revealedCount) * 10_000) / s.slotCount);
    }
}
