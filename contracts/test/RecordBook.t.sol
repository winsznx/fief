// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FiefAgent} from "../src/FiefAgent.sol";
import {EpochBook} from "../src/EpochBook.sol";
import {RecordBook} from "../src/RecordBook.sol";
import {IInferenceServing} from "../src/interfaces/IInferenceServing.sol";
import {MockInferenceServing} from "./mocks/MockInferenceServing.sol";
import {Fixtures} from "./Fixtures.sol";

/// @notice Commit/reveal against the reference fixtures (PRD v2 §11, §16 P2).
/// @dev Every expected value comes from `packages/reference/fixtures/slots.json`.
///      Nothing here restates a hash, a signature or a commit line inline.
contract RecordBookTest is Test {
    FiefAgent internal agents;
    EpochBook internal epochs;
    RecordBook internal book;
    MockInferenceServing internal serving;

    Fixtures.Bundle internal b;
    address internal owner = address(0xB0B);
    uint256 internal agentId;

    function setUp() public {
        b = Fixtures.bundle();

        // The fixtures were generated against a specific book address and chain
        // id, both of which are baked into the signed commit lines. Reproduce
        // them exactly or every memcmp fails for the wrong reason.
        vm.chainId(b.chainId);
        vm.warp(b.startTime - 1 days);

        agents = new FiefAgent();
        epochs = new EpochBook(agents);
        serving = new MockInferenceServing();

        RecordBook deployed = new RecordBook(agents, epochs, IInferenceServing(address(serving)));
        // Place the book at the fixture's address so `book:<addr>` matches.
        vm.etch(b.book, address(deployed).code);
        book = RecordBook(b.book);
        // `chainId` and `admin` are immutables baked into the runtime code, so
        // re-deploying at the target address preserves them.

        epochs.setRecordBook(address(book));
        serving.set(b.provider, b.teeSigner, true);

        vm.startPrank(owner);
        agentId = agents.register(b.strategyHash, bytes32(0), "BTC short-horizon direction");
        agents.setOperator(agentId, b.operator);

        address[] memory ps = new address[](1);
        ps[0] = b.provider;
        epochs.openEpoch(agentId, b.epochId, _spec(), ps);
        vm.stopPrank();

        require(agentId == b.agentId, "fixture agentId drift");
    }

    function _spec() internal view returns (EpochBook.EpochSpec memory) {
        return EpochBook.EpochSpec({
            market: keccak256("BTC-USDT"),
            cadenceSeconds: b.cadenceSeconds,
            horizonSeconds: b.horizonSeconds,
            maxCommitDelay: b.maxCommitDelay,
            disclosureDelay: b.disclosureDelay,
            startTime: b.startTime,
            slotCount: b.slotCount,
            strategyHash: b.strategyHash,
            providerSetHash: keccak256(abi.encode(b.provider))
        });
    }

    function _commit(Fixtures.Vector memory v) internal {
        vm.warp(v.snapshotTime + 5);
        vm.prank(b.operator);
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, b.provider
        );
    }

    function _revealArgs(Fixtures.Vector memory v)
        internal
        view
        returns (RecordBook.RevealArgs memory)
    {
        return RecordBook.RevealArgs({
            agentId: agentId,
            epochId: b.epochId,
            slot: v.slot,
            respData: v.respData,
            signature: v.signature,
            commitOffset: v.commitOffset,
            inputHash: v.inputHash,
            renter: v.renter,
            salt: v.salt
        });
    }

    /* ------------------------- the reference agreement ------------------------ */

    /// @notice Solidity must rebuild the exact bytes the reference model did.
    function test_expectedCommitBytes_matchesReference() public view {
        for (uint256 i = 0; i < Fixtures.count(); ++i) {
            Fixtures.Vector memory v = Fixtures.vector(i);
            if (!Fixtures.isHonest(v)) continue;

            bytes memory got = book.expectedCommitBytes(
                agentId, b.epochId, v.slot, b.strategyHash, v.inputHash, v.renter
            );
            assertEq(string(got), v.exp, v.name);
        }
    }

    /// @notice On-chain sha256 must agree with the reference model's.
    function test_respSha_matchesReference() public view {
        for (uint256 i = 0; i < Fixtures.count(); ++i) {
            Fixtures.Vector memory v = Fixtures.vector(i);
            assertEq(sha256(v.respData), v.respSha, v.name);
        }
    }

    /// @notice Every honest vector commits and reveals.
    function test_honestVectors_commitAndReveal() public {
        uint256 revealed;
        for (uint256 i = 0; i < Fixtures.count(); ++i) {
            Fixtures.Vector memory v = Fixtures.vector(i);
            if (!Fixtures.isHonest(v)) continue;
            if (book.commitOf(agentId, b.epochId, v.slot).committedAt != 0) continue;

            _commit(v);
            vm.warp(v.revealOpen);
            book.revealDecision(_revealArgs(v));

            RecordBook.Entry memory e = book.entryOf(agentId, b.epochId, v.slot);
            assertEq(e.teeSigner, b.teeSigner, "signer");
            assertEq(e.respSha, v.respSha, "respSha");
            ++revealed;
        }
        assertGt(revealed, 0, "no honest vectors exercised");
    }

    /// @notice Every adversarial vector is rejected at reveal.
    function test_adversarialVectors_rejected() public {
        uint256 rejected;
        for (uint256 i = 0; i < Fixtures.count(); ++i) {
            Fixtures.Vector memory v = Fixtures.vector(i);
            if (Fixtures.isHonest(v)) continue;
            if (book.commitOf(agentId, b.epochId, v.slot).committedAt != 0) continue;

            _commit(v);
            vm.warp(v.revealOpen);
            vm.expectRevert(RecordBook.BadCommit.selector);
            book.revealDecision(_revealArgs(v));
            ++rejected;
        }
        assertGt(rejected, 0, "no adversarial vectors exercised");
    }

    /* ------------------------------ I12: deadlines ---------------------------- */

    function test_commit_acceptedExactlyAtDeadline() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        vm.warp(v.commitDeadline);
        vm.prank(b.operator);
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, b.provider
        );
        assertGt(book.commitOf(agentId, b.epochId, v.slot).committedAt, 0);
    }

    function test_commit_rejectedOneSecondLate() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        vm.warp(v.commitDeadline + 1);
        vm.prank(b.operator);
        vm.expectRevert(RecordBook.SlotDeadlinePassed.selector);
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, b.provider
        );
    }

    function test_commit_onlyOperator() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        vm.warp(v.snapshotTime + 1);
        vm.prank(address(0xDEAD));
        vm.expectRevert(RecordBook.NotOperator.selector);
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, b.provider
        );
    }

    function test_commit_rejectsUnpinnedProvider() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        vm.warp(v.snapshotTime + 1);
        vm.prank(b.operator);
        vm.expectRevert(RecordBook.ProviderNotPinned.selector);
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, address(0xBEEF)
        );
    }

    function test_commit_rejectsDuplicateSlot() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.prank(b.operator);
        vm.expectRevert(RecordBook.SlotAlreadyCommitted.selector);
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, b.provider
        );
    }

    /* ------------------------------- I14: reveal ------------------------------ */

    function test_reveal_tooEarly() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen - 1);
        vm.expectRevert(RecordBook.RevealTooEarly.selector);
        book.revealDecision(_revealArgs(v));
    }

    function test_reveal_wrongSaltDoesNotOpenCommitment() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);

        RecordBook.RevealArgs memory a = _revealArgs(v);
        a.salt = keccak256("not the salt");
        vm.expectRevert(RecordBook.BadReveal.selector);
        book.revealDecision(a);
    }

    function test_reveal_tamperedBytesRejected() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);

        RecordBook.RevealArgs memory a = _revealArgs(v);
        bytes memory tampered = v.respData;
        tampered[tampered.length - 2] = 0x20; // one byte, inside the signed span
        a.respData = tampered;

        vm.expectRevert(RecordBook.BadReveal.selector);
        book.revealDecision(a);
    }

    /// @notice A failed reveal must leave the slot intact and retryable.
    /// @dev Reveal is permissionless, so if a bad reveal burned the slot anyone
    ///      could destroy an honest agent's completeness by spamming garbage.
    ///      This is the anti-griefing property, and it is why `invalid` is
    ///      derived at finalize rather than counted here.
    function test_reveal_failureIsNotGriefable() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);

        RecordBook.RevealArgs memory bad = _revealArgs(v);
        bad.salt = keccak256("griefer");
        vm.prank(address(0xBAD));
        vm.expectRevert(RecordBook.BadReveal.selector);
        book.revealDecision(bad);

        // The honest reveal still succeeds afterwards.
        book.revealDecision(_revealArgs(v));
        assertTrue(book.isRevealed(agentId, b.epochId, v.slot));
    }

    function test_reveal_cannotRevealTwice() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);
        book.revealDecision(_revealArgs(v));

        vm.expectRevert(RecordBook.AlreadyRevealed.selector);
        book.revealDecision(_revealArgs(v));
    }

    function test_reveal_requiresCommit() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        vm.warp(v.revealOpen);
        vm.expectRevert(RecordBook.NoCommit.selector);
        book.revealDecision(_revealArgs(v));
    }

    function test_reveal_isPermissionless() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);

        // A renter, not the operator, opens the commitment. An owner sitting on
        // a losing call cannot bury it.
        vm.prank(address(0xCAFE));
        book.revealDecision(_revealArgs(v));
        assertTrue(book.isRevealed(agentId, b.epochId, v.slot));
    }

    /* ------------------------------- I1: signer ------------------------------- */

    function test_reveal_rejectsUnacknowledgedSigner() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        serving.set(b.provider, b.teeSigner, false);
        vm.warp(v.revealOpen);

        vm.expectRevert(RecordBook.BadSigner.selector);
        book.revealDecision(_revealArgs(v));
    }

    function test_reveal_rejectsWrongRegisteredSigner() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        serving.set(b.provider, address(0xFEED), true);
        vm.warp(v.revealOpen);

        vm.expectRevert(RecordBook.BadSigner.selector);
        book.revealDecision(_revealArgs(v));
    }

    /// @dev A provider the serving contract does not know must fail closed.
    function test_reveal_providerLookupRevertFailsClosed() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        serving.setReverts(b.provider, true);
        vm.warp(v.revealOpen);

        assertEq(book.expectedTeeSigner(b.provider), address(0));
        vm.expectRevert(RecordBook.BadSigner.selector);
        book.revealDecision(_revealArgs(v));
    }

    /* --------------------------------- gas ----------------------------------- */

    /// @notice Measures the two hot paths directly.
    /// @dev The gas report cannot attribute RecordBook because it is placed with
    ///      `vm.etch` at the fixture's address, so measure explicitly. PRD v2
    ///      §13 claims reveal stays under 250k: one sha256 of the response, one
    ///      ecrecover, one staticcall and one memcmp. This is the check on that
    ///      claim rather than the estimate.
    function test_gas_commitAndReveal() public {
        Fixtures.Vector memory v = Fixtures.vector(0);

        vm.warp(v.snapshotTime + 5);
        vm.prank(b.operator);
        uint256 g0 = gasleft();
        book.commitDecision(
            agentId, b.epochId, v.slot, v.reqSha, v.respSha, v.receiptCommit, b.provider
        );
        uint256 commitGas = g0 - gasleft();

        vm.warp(v.revealOpen);
        uint256 g1 = gasleft();
        book.revealDecision(_revealArgs(v));
        uint256 revealGas = g1 - gasleft();

        emit log_named_uint("commitDecision gas", commitGas);
        emit log_named_uint("revealDecision gas", revealGas);
        emit log_named_uint("respData bytes", v.respData.length);

        assertLt(commitGas, 200_000, "commit should stay cheap: it is the timely path");
        assertLt(revealGas, 250_000, "reveal exceeds the PRD v2 section 13 budget");
    }

    /* ------------------------- I13-adjacent: wrong slot ----------------------- */

    /// @notice A genuine receipt cannot be replayed into a different slot.
    function test_reveal_rejectsCrossSlotReplay() public {
        Fixtures.Vector memory honest = Fixtures.vector(0);

        // Commit slot 0 using slot 0's own commitment, then try to open it with
        // a different slot's payload.
        Fixtures.Vector memory other;
        bool found;
        for (uint256 i = 0; i < Fixtures.count(); ++i) {
            Fixtures.Vector memory c = Fixtures.vector(i);
            if (Fixtures.isHonest(c) && c.slot != honest.slot) {
                other = c;
                found = true;
                break;
            }
        }
        require(found, "need a second honest slot");

        vm.warp(honest.snapshotTime + 5);
        vm.prank(b.operator);
        book.commitDecision(
            agentId,
            b.epochId,
            honest.slot,
            other.reqSha,
            other.respSha,
            other.receiptCommit,
            b.provider
        );

        vm.warp(honest.revealOpen + b.cadenceSeconds * b.slotCount);
        RecordBook.RevealArgs memory a = _revealArgs(other);
        a.slot = honest.slot;
        vm.expectRevert(RecordBook.BadCommit.selector);
        book.revealDecision(a);
    }

    /* ---------------------------- strict (demo) ------------------------------ */

    /// @notice The demo red transaction must SUCCEED while rejecting the reveal.
    /// @dev A reverted transaction shows on an explorer as a failure, which
    ///      reads like the system broke rather than like the system worked.
    ///      `revealDecisionStrict` catches the revert and emits
    ///      `DecisionRejected`, so a judge sees a successful transaction whose
    ///      event says the tamper was caught.
    function test_strict_emitsRejectionInsteadOfReverting() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);

        RecordBook.RevealArgs memory bad = _revealArgs(v);
        bad.salt = keccak256("tampered");

        vm.expectEmit(true, true, true, true);
        emit RecordBook.DecisionRejected(agentId, b.epochId, v.slot, "BadReveal");
        bool ok = book.revealDecisionStrict(bad);

        assertFalse(ok, "strict must report failure");
        assertFalse(book.isRevealed(agentId, b.epochId, v.slot), "slot must stay unrevealed");
    }

    /// @notice A rejected strict reveal must not burn the slot either.
    function test_strict_leavesSlotRevealable() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);
        vm.warp(v.revealOpen);

        RecordBook.RevealArgs memory bad = _revealArgs(v);
        bad.salt = keccak256("tampered");
        book.revealDecisionStrict(bad);

        assertTrue(book.revealDecisionStrict(_revealArgs(v)), "honest strict reveal succeeds");
        assertTrue(book.isRevealed(agentId, b.epochId, v.slot));
    }

    function test_strict_reportsTheRightReason() public {
        Fixtures.Vector memory v = Fixtures.vector(0);
        _commit(v);

        // Before the window: RevealTooEarly, not BadReveal.
        vm.warp(v.revealOpen - 1);
        vm.expectEmit(true, true, true, true);
        emit RecordBook.DecisionRejected(agentId, b.epochId, v.slot, "RevealTooEarly");
        assertFalse(book.revealDecisionStrict(_revealArgs(v)));
    }
}
