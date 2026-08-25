// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FiefAgent} from "../src/FiefAgent.sol";
import {EpochBook} from "../src/EpochBook.sol";

/// @notice Forward epochs and completeness (PRD v2 §5, §7 I11 / I13).
/// @dev The tests that matter here are the ones that would have let v1's
///      selective-omission attack through.
contract EpochBookTest is Test {
    FiefAgent internal agents;
    EpochBook internal epochs;

    address internal owner = address(0xB0B);
    address internal recorder = address(0xBEEF);
    uint256 internal agentId;

    uint64 internal constant T0 = 1_800_000_000;
    uint32 internal constant SLOTS = 12;

    function setUp() public {
        vm.warp(T0 - 1 days);
        agents = new FiefAgent();
        epochs = new EpochBook(agents);
        epochs.setRecordBook(recorder);

        vm.prank(owner);
        agentId = agents.register(keccak256("H"), bytes32(0), "BTC");
    }

    function _spec(uint64 startTime) internal pure returns (EpochBook.EpochSpec memory) {
        return EpochBook.EpochSpec({
            market: keccak256("BTC-USDT"),
            cadenceSeconds: 300,
            horizonSeconds: 300,
            maxCommitDelay: 30,
            disclosureDelay: 60,
            startTime: startTime,
            slotCount: SLOTS,
            strategyHash: keccak256("H"),
            providerSetHash: keccak256("providers")
        });
    }

    function _providers() internal pure returns (address[] memory ps) {
        ps = new address[](1);
        ps[0] = address(0xF00D);
    }

    function _open() internal {
        vm.prank(owner);
        epochs.openEpoch(agentId, 0, _spec(T0), _providers());
    }

    /* ------------------------------ I11: no past ------------------------------ */

    /// @notice The entire prospective claim rests on this one check.
    function test_openEpoch_rejectsStartTimeInPast() public {
        vm.warp(T0);
        vm.prank(owner);
        vm.expectRevert(EpochBook.StartTimeInPast.selector);
        epochs.openEpoch(agentId, 0, _spec(T0 - 1), _providers());
    }

    function test_openEpoch_acceptsStartTimeNowOrLater() public {
        vm.warp(T0);
        vm.prank(owner);
        epochs.openEpoch(agentId, 0, _spec(T0), _providers());
        assertTrue(epochs.isOpen(agentId, 0));
    }

    function test_openEpoch_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(EpochBook.NotOwner.selector);
        epochs.openEpoch(agentId, 0, _spec(T0), _providers());
    }

    function test_openEpoch_rejectsOverlappingCommitWindow() public {
        EpochBook.EpochSpec memory s = _spec(T0);
        s.maxCommitDelay = s.cadenceSeconds; // would put two slots in flight
        vm.prank(owner);
        vm.expectRevert(EpochBook.BadSpec.selector);
        epochs.openEpoch(agentId, 0, s, _providers());
    }

    function test_openEpoch_isImmutable() public {
        _open();
        vm.prank(owner);
        vm.expectRevert(EpochBook.AlreadyOpened.selector);
        epochs.openEpoch(agentId, 0, _spec(T0 + 10_000), _providers());
    }

    /* ---------------------------- schedule derivation ------------------------- */

    function test_scheduleIsDerivedFromSpecAlone() public {
        _open();
        assertEq(epochs.slotSnapshotTime(agentId, 0, 0), T0);
        assertEq(epochs.slotSnapshotTime(agentId, 0, 3), T0 + 900);
        assertEq(epochs.slotCommitDeadline(agentId, 0, 3), T0 + 900 + 30);
        assertEq(epochs.slotRevealOpen(agentId, 0, 3), T0 + 900 + 300 + 60);
        assertEq(epochs.epochEnd(agentId, 0), T0 + uint64(SLOTS - 1) * 300 + 30);
    }

    function test_unknownSlotReverts() public {
        _open();
        vm.expectRevert(EpochBook.UnknownSlot.selector);
        epochs.slotSnapshotTime(agentId, 0, SLOTS);
    }

    /* ------------------------------ providers -------------------------------- */

    function test_pinProviders_onlyBeforeStart() public {
        _open();
        address[] memory ps = new address[](1);
        ps[0] = address(0xAAA);

        vm.prank(owner);
        epochs.pinProviders(agentId, 0, ps);
        assertTrue(epochs.isPinnedProvider(agentId, 0, address(0xAAA)));

        // Swapping providers mid-epoch would let an operator route around a
        // signer the record already depends on.
        vm.warp(T0 + 1);
        vm.prank(owner);
        vm.expectRevert(EpochBook.EpochNotOpen.selector);
        epochs.pinProviders(agentId, 0, ps);
    }

    /* ------------------------------ I13: totality ----------------------------- */

    function test_finalize_tooEarly() public {
        _open();
        vm.warp(epochs.finalizeAfter(agentId, 0));
        vm.expectRevert(EpochBook.EpochNotOver.selector);
        epochs.finalizeEpoch(agentId, 0);
    }

    function test_finalize_fullyMissedEpochReportsHonestly() public {
        _open();
        vm.warp(epochs.finalizeAfter(agentId, 0) + 1);

        (uint32 committed, uint32 revealed, uint32 missed, uint32 invalid) =
            epochs.finalizeEpoch(agentId, 0);

        assertEq(committed, 0);
        assertEq(revealed, 0);
        assertEq(missed, SLOTS);
        assertEq(invalid, 0);
    }

    /// @notice The v1 omission attack, replayed against v2.
    /// @dev An operator commits and reveals only the six slots it liked. Under
    ///      v1 the record would have shown six clean entries and no trace of
    ///      the rest. Here it reports 50% completeness, permanently.
    function test_finalize_droppedSlotsAreVisible() public {
        _open();
        vm.startPrank(recorder);
        for (uint32 i = 0; i < 6; ++i) {
            epochs.noteCommitted(agentId, 0);
            epochs.noteRevealed(agentId, 0);
        }
        vm.stopPrank();

        vm.warp(epochs.finalizeAfter(agentId, 0) + 1);
        (uint32 committed, uint32 revealed, uint32 missed, uint32 invalid) =
            epochs.finalizeEpoch(agentId, 0);

        assertEq(committed, 6);
        assertEq(revealed, 6);
        assertEq(missed, 6);
        assertEq(invalid, 0);
        assertEq(epochs.completenessBps(agentId, 0), 5000);
    }

    /// @notice Committed but never opened counts as invalid, not as a success.
    function test_finalize_unrevealedCommitsCountInvalid() public {
        _open();
        vm.startPrank(recorder);
        for (uint32 i = 0; i < 4; ++i) epochs.noteCommitted(agentId, 0);
        epochs.noteRevealed(agentId, 0);
        vm.stopPrank();

        vm.warp(epochs.finalizeAfter(agentId, 0) + 1);
        (uint32 committed, uint32 revealed, uint32 missed, uint32 invalid) =
            epochs.finalizeEpoch(agentId, 0);

        assertEq(committed, 4);
        assertEq(revealed, 1);
        assertEq(invalid, 3);
        assertEq(missed, SLOTS - 4);
        // I13, both halves.
        assertEq(committed + missed, SLOTS);
        assertEq(revealed + invalid, committed);
    }

    function test_finalize_isIdempotentlyGuarded() public {
        _open();
        vm.warp(epochs.finalizeAfter(agentId, 0) + 1);
        epochs.finalizeEpoch(agentId, 0);
        vm.expectRevert(EpochBook.AlreadyFinalized.selector);
        epochs.finalizeEpoch(agentId, 0);
    }

    /// @notice I13 holds for any commit/reveal split the recorder could produce.
    function testFuzz_finalize_accountsForEverySlot(uint8 committedRaw, uint8 revealedRaw) public {
        uint32 c = uint32(bound(committedRaw, 0, SLOTS));
        uint32 r = uint32(bound(revealedRaw, 0, c));

        _open();
        vm.startPrank(recorder);
        for (uint32 i = 0; i < c; ++i) epochs.noteCommitted(agentId, 0);
        for (uint32 i = 0; i < r; ++i) epochs.noteRevealed(agentId, 0);
        vm.stopPrank();

        vm.warp(epochs.finalizeAfter(agentId, 0) + 1);
        (uint32 committed, uint32 revealed, uint32 missed, uint32 invalid) =
            epochs.finalizeEpoch(agentId, 0);

        assertEq(committed + missed, SLOTS, "committed + missed != slotCount");
        assertEq(revealed + invalid, committed, "revealed + invalid != committed");
    }

    /* ------------------------------- abandonment ------------------------------ */

    function test_abandon_isAnExplicitOnChainAct() public {
        _open();
        vm.prank(owner);
        epochs.abandonEpoch(agentId, 0, "provider outage");

        assertFalse(epochs.isOpen(agentId, 0));
        assertGt(epochs.metaOf(agentId, 0).abandonedAt, 0);
    }

    function test_abandon_onlyOwner() public {
        _open();
        vm.prank(address(0xDEAD));
        vm.expectRevert(EpochBook.NotOwner.selector);
        epochs.abandonEpoch(agentId, 0, "nope");
    }

    /* -------------------------------- guards ---------------------------------- */

    function test_counters_onlyRecordBook() public {
        _open();
        vm.expectRevert(EpochBook.NotRecordBook.selector);
        epochs.noteCommitted(agentId, 0);
    }

    function test_setRecordBook_onlyOnce() public {
        vm.expectRevert(EpochBook.RecordBookAlreadySet.selector);
        epochs.setRecordBook(address(0x1234));
    }
}
