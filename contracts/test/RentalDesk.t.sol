// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FiefAgent} from "../src/FiefAgent.sol";
import {EpochBook} from "../src/EpochBook.sol";
import {RecordBook} from "../src/RecordBook.sol";
import {RentalDesk} from "../src/RentalDesk.sol";
import {IInferenceServing} from "../src/interfaces/IInferenceServing.sol";
import {MockInferenceServing} from "./mocks/MockInferenceServing.sol";

/// @notice Escrow, epoch-bound grants and settlement (PRD v2 §5, §7 I5 / I15).
contract RentalDeskTest is Test {
    FiefAgent internal agents;
    EpochBook internal epochs;
    RecordBook internal book;
    RentalDesk internal desk;
    MockInferenceServing internal serving;

    address internal owner = address(0xB0B);
    address internal renter = address(0xA11CE);
    address internal treasury = address(0x7EA);

    uint256 internal agentId;
    uint256 internal constant FEE = 1 ether;
    uint64 internal constant TERM = 7 days;

    function setUp() public {
        agents = new FiefAgent();
        epochs = new EpochBook(agents);
        serving = new MockInferenceServing();
        book = new RecordBook(agents, epochs, IInferenceServing(address(serving)));
        epochs.setRecordBook(address(book));
        desk = new RentalDesk(agents, book, treasury);

        vm.prank(owner);
        agentId = agents.register(keccak256("H"), bytes32(0), "BTC");

        vm.prank(owner);
        desk.list(agentId, FEE, 5 ether, TERM);

        vm.deal(renter, 100 ether);
    }

    /// @dev Writes an entry directly into RecordBook storage. Settlement only
    ///      reads `revealedAt` and `renter`, and the full commit/reveal path is
    ///      already covered in RecordBook.t.sol, so forging storage here keeps
    ///      these tests about escrow rather than about receipts.
    function _fakeReveal(uint64 epochId, uint32 slot, address who) internal {
        RecordBook.Entry memory e;
        e.renter = who;
        e.revealedAt = uint64(block.timestamp);
        e.teeSigner = address(0x7EE);
        vm.mockCall(
            address(book),
            abi.encodeCall(RecordBook.entryOf, (agentId, epochId, slot)),
            abi.encode(e)
        );
    }

    function _slots(uint32 n) internal pure returns (uint32[] memory out) {
        out = new uint32[](n);
        for (uint32 i = 0; i < n; ++i) out[i] = i;
    }

    /* --------------------------------- rent ----------------------------------- */

    function test_rent_derivesAllowanceAndExpiry() public {
        vm.prank(renter);
        desk.rent{value: 10 ether + 5}(agentId, 4);

        RentalDesk.Grant memory g = desk.grantOf(agentId, renter);
        assertEq(g.maxDecisions, 10, "floor division, dust stays the renter's");
        assertEq(g.expiry, uint64(block.timestamp) + TERM);
        assertEq(g.epochId, 4);
        assertEq(g.escrowedWei, 10 ether + 5);
    }

    function test_rent_rejectsEscrowBelowMinimum() public {
        vm.prank(renter);
        vm.expectRevert(RentalDesk.EscrowTooSmall.selector);
        desk.rent{value: 1 ether}(agentId, 0);
    }

    function test_rent_rejectsUnlisted() public {
        vm.prank(owner);
        desk.unlist(agentId);

        vm.prank(renter);
        vm.expectRevert(RentalDesk.NotListed.selector);
        desk.rent{value: 10 ether}(agentId, 0);
    }

    /* -------------------------------- settle ---------------------------------- */

    function test_settle_paysOwnerNetOfProtocolFee() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        _fakeReveal(4, 0, renter);
        _fakeReveal(4, 1, renter);

        uint256 ownerBefore = owner.balance;
        uint256 treasuryBefore = treasury.balance;

        desk.settle(agentId, renter, _slots(2));

        // 2 ether gross, 200 bps to the protocol. Credited, not pushed.
        assertEq(desk.withdrawable(treasury), 0.04 ether);
        assertEq(desk.withdrawable(owner), 1.96 ether);
        assertEq(owner.balance, ownerBefore, "nothing pushed");

        vm.prank(owner);
        desk.withdraw();
        vm.prank(treasury);
        desk.withdraw();

        assertEq(treasury.balance - treasuryBefore, 0.04 ether);
        assertEq(owner.balance - ownerBefore, 1.96 ether);
    }

    /// @notice A grant settles only against the epoch it was bought for (I15).
    function test_settle_refusesOtherEpoch() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        // Revealed, but in epoch 5.
        _fakeReveal(5, 0, renter);

        vm.expectRevert(RentalDesk.NothingToSettle.selector);
        desk.settle(agentId, renter, _slots(1));
    }

    function test_settle_refusesOtherRenter() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        _fakeReveal(4, 0, address(0xDEAD));

        vm.expectRevert(RentalDesk.NothingToSettle.selector);
        desk.settle(agentId, renter, _slots(1));
    }

    /// @notice Settlement is on reveal, never on commit.
    function test_settle_refusesUnrevealedSlot() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        vm.expectRevert(RentalDesk.NothingToSettle.selector);
        desk.settle(agentId, renter, _slots(3));
    }

    function test_settle_neverPaysTheSameSlotTwice() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);
        _fakeReveal(4, 0, renter);

        desk.settle(agentId, renter, _slots(1));
        assertEq(desk.grantOf(agentId, renter).settledWei, FEE);

        vm.expectRevert(RentalDesk.NothingToSettle.selector);
        desk.settle(agentId, renter, _slots(1));
    }

    function test_settle_stopsAtAllowance() public {
        vm.prank(renter);
        desk.rent{value: 5 ether}(agentId, 4); // allowance 5

        for (uint32 i = 0; i < 8; ++i) _fakeReveal(4, i, renter);
        desk.settle(agentId, renter, _slots(8));

        RentalDesk.Grant memory g = desk.grantOf(agentId, renter);
        assertEq(g.settledWei, 5 ether);
        assertEq(g.remainingWei, 0);
    }

    /* ------------------------------ epoch consent ----------------------------- */

    function test_pausedGrantCannotSettle() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);
        _fakeReveal(4, 0, renter);

        vm.prank(owner);
        desk.pauseForNewEpoch(agentId, renter, 5);

        vm.expectRevert(RentalDesk.GrantPausedError.selector);
        desk.settle(agentId, renter, _slots(1));
    }

    function test_consentResumesAgainstNewEpoch() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        vm.prank(owner);
        desk.pauseForNewEpoch(agentId, renter, 5);

        vm.prank(renter);
        desk.consentToEpoch(agentId, 5);

        _fakeReveal(5, 0, renter);
        desk.settle(agentId, renter, _slots(1));
        assertEq(desk.grantOf(agentId, renter).settledWei, FEE);
    }

    /// @notice A renter asked to pay for a brain they did not buy can always exit.
    function test_pausedRenterCanExitEarly() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        vm.prank(owner);
        desk.pauseForNewEpoch(agentId, renter, 5);

        uint256 before = renter.balance;
        vm.prank(renter);
        desk.refund(agentId);
        vm.prank(renter);
        desk.withdraw();

        assertEq(renter.balance - before, 10 ether);
    }

    function test_refund_blockedBeforeExpiry() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        vm.prank(renter);
        vm.expectRevert(RentalDesk.NotExpired.selector);
        desk.refund(agentId);
    }

    function test_refund_afterExpiryReturnsRemainder() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);
        _fakeReveal(4, 0, renter);
        desk.settle(agentId, renter, _slots(1));

        vm.warp(block.timestamp + TERM + 1);
        uint256 before = renter.balance;
        vm.prank(renter);
        desk.refund(agentId);
        vm.prank(renter);
        desk.withdraw();

        assertEq(renter.balance - before, 9 ether);
    }

    /* ------------------------------ I5: conservation -------------------------- */

    function testFuzz_conservationHolds(uint96 escrowRaw, uint8 slotsRaw) public {
        uint256 escrow = bound(escrowRaw, 5 ether, 90 ether);
        uint32 n = uint32(bound(slotsRaw, 0, 20));

        vm.deal(renter, 100 ether);
        vm.prank(renter);
        desk.rent{value: escrow}(agentId, 4);

        for (uint32 i = 0; i < n; ++i) _fakeReveal(4, i, renter);
        if (n > 0) {
            try desk.settle(agentId, renter, _slots(n)) {} catch {}
        }

        vm.warp(block.timestamp + TERM + 1);
        vm.prank(renter);
        desk.refund(agentId);

        RentalDesk.Grant memory g = desk.grantOf(agentId, renter);
        // The contract asserts this internally on every mutation; re-check the
        // final state here so a regression is loud rather than an assert panic.
        assertEq(g.settledWei + g.refundedWei + g.remainingWei, g.escrowedWei);
        assertEq(g.remainingWei, 0);
    }

    /* ---------------------------- pull payments ------------------------------ */

    /// @notice An owner that reverts on receive must not be able to block settlement.
    /// @dev This is the denial of service the original push implementation
    ///      allowed: one hostile payee froze every renter's escrow. Slither
    ///      flagged it as arbitrary-send-eth, and the PRD had specified a pull
    ///      pattern all along.
    function test_hostileOwnerCannotBlockSettlement() public {
        Rejector hostile = new Rejector();

        vm.prank(owner);
        agents.transferAgent(agentId, address(hostile));

        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);
        _fakeReveal(4, 0, renter);

        // Settlement succeeds even though the payee cannot accept ETH.
        desk.settle(agentId, renter, _slots(1));
        assertEq(desk.withdrawable(address(hostile)), 0.98 ether);

        // Only the hostile payee's own withdrawal fails, and only for them.
        vm.prank(address(hostile));
        vm.expectRevert(RentalDesk.TransferFailed.selector);
        desk.withdraw();

        // The treasury is unaffected.
        uint256 before = treasury.balance;
        vm.prank(treasury);
        desk.withdraw();
        assertEq(treasury.balance - before, 0.02 ether);
    }

    function test_withdraw_zeroesBeforeSendingAndRejectsEmpty() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);
        _fakeReveal(4, 0, renter);
        desk.settle(agentId, renter, _slots(1));

        vm.prank(owner);
        desk.withdraw();
        assertEq(desk.withdrawable(owner), 0);

        vm.prank(owner);
        vm.expectRevert(RentalDesk.NothingToWithdraw.selector);
        desk.withdraw();
    }

    /// @notice settledCount must persist, or the allowance only binds one call.
    function test_settledCountPersistsAcrossCalls() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        _fakeReveal(4, 0, renter);
        desk.settle(agentId, renter, _slots(1));
        assertEq(desk.grantOf(agentId, renter).settledCount, 1);

        _fakeReveal(4, 1, renter);
        uint32[] memory one = new uint32[](1);
        one[0] = 1;
        desk.settle(agentId, renter, one);
        assertEq(desk.grantOf(agentId, renter).settledCount, 2);
    }

    function test_settle_rejectsOversizedSlotArray() public {
        vm.prank(renter);
        desk.rent{value: 10 ether}(agentId, 4);

        uint32[] memory many = new uint32[](257);
        vm.expectRevert(RentalDesk.TooManySlots.selector);
        desk.settle(agentId, renter, many);
    }

    function test_constructor_rejectsZeroTreasury() public {
        vm.expectRevert(RentalDesk.ZeroAddress.selector);
        new RentalDesk(agents, book, address(0));
    }
}

/// @dev A payee that cannot accept ETH.
contract Rejector {
    receive() external payable {
        revert("no");
    }
}
