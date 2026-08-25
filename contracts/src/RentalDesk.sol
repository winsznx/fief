// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FiefAgent} from "./FiefAgent.sol";
import {RecordBook} from "./RecordBook.sol";

/// @title RentalDesk
/// @notice Listings, escrow, epoch-bound grants and per-slot settlement.
///
/// @dev Two properties carry the weight. Conservation (I5) is asserted on every
///      mutation, not just in tests, because an escrow bug is a fund bug. And
///      grants are bound to the epoch they were bought against (I15): a new
///      epoch is a different brain, so consent to rent one is not consent to
///      rent the next.
///
///      Settlement happens on REVEAL, never on commit, so a renter only pays
///      for a signal that has been proven on-chain.
contract RentalDesk {
    struct Listing {
        uint256 feePerDecisionWei;
        uint256 minEscrowWei;
        uint64 termSeconds;
        bool active;
    }

    struct Grant {
        uint64 epochId;
        uint64 expiry;
        uint32 maxDecisions;
        uint32 settledCount;
        uint256 escrowedWei;
        uint256 remainingWei;
        uint256 settledWei;
        uint256 refundedWei;
        bool paused;
    }

    uint256 public constant PROTOCOL_FEE_BPS = 200;
    /// @dev Bounds the settle loop so a caller cannot construct a transaction
    ///      that runs out of gas partway and wastes the fee.
    uint256 public constant MAX_SETTLE_SLOTS = 256;
    uint256 private constant BPS = 10_000;

    FiefAgent public immutable agents;
    RecordBook public immutable records;
    address public immutable treasury;

    mapping(uint256 => Listing) public listings;
    /// @dev agentId => renter => grant
    mapping(uint256 => mapping(address => Grant)) private _grants;
    /// @dev agentId => epochId => slot => settled, so a slot can never pay twice.
    mapping(uint256 => mapping(uint64 => mapping(uint32 => bool))) public slotSettled;
    /// @dev Pull payments. A push transfer lets a payee that reverts on receive
    ///      permanently block settlement for everyone, which is a live denial of
    ///      service against an honest renter's escrow. Credited here, withdrawn
    ///      by the payee on their own transaction.
    mapping(address => uint256) public withdrawable;

    event Listed(uint256 indexed agentId, uint256 feePerDecisionWei, uint64 termSeconds);
    event Unlisted(uint256 indexed agentId);
    event Rented(
        uint256 indexed agentId, address indexed renter, uint64 indexed epochId, uint256 escrowWei
    );
    event Settled(
        uint256 indexed agentId, address indexed renter, uint32 slots, uint256 ownerWei
    );
    event Refunded(uint256 indexed agentId, address indexed renter, uint256 amountWei);
    event Credited(address indexed payee, uint256 amountWei);
    event Withdrawn(address indexed payee, uint256 amountWei);
    event GrantPaused(uint256 indexed agentId, address indexed renter, uint64 newEpochId);
    event GrantResumed(uint256 indexed agentId, address indexed renter, uint64 epochId);

    error NotOwner();
    error NotListed();
    error EscrowTooSmall();
    error BadListing();
    error NoGrant();
    error GrantPausedError();
    error GrantExpired();
    error NotExpired();
    error TransferFailed();
    error NothingToSettle();
    error NothingToWithdraw();
    error ZeroAddress();
    error TooManySlots();

    /// @dev A zero treasury would silently burn every protocol fee.
    constructor(FiefAgent _agents, RecordBook _records, address _treasury) {
        if (_treasury == address(0)) revert ZeroAddress();
        agents = _agents;
        records = _records;
        treasury = _treasury;
    }

    /// @dev escrowed == settled + refunded + remaining, always (I5).
    function _assertConservation(Grant storage g) private view {
        assert(g.settledWei + g.refundedWei + g.remainingWei == g.escrowedWei);
    }

    /* -------------------------------- listing -------------------------------- */

    function list(
        uint256 agentId,
        uint256 feePerDecisionWei,
        uint256 minEscrowWei,
        uint64 termSeconds
    ) external {
        if (agents.ownerOf(agentId) != msg.sender) revert NotOwner();
        if (feePerDecisionWei == 0 || termSeconds == 0) revert BadListing();

        listings[agentId] = Listing(feePerDecisionWei, minEscrowWei, termSeconds, true);
        emit Listed(agentId, feePerDecisionWei, termSeconds);
    }

    function unlist(uint256 agentId) external {
        if (agents.ownerOf(agentId) != msg.sender) revert NotOwner();
        listings[agentId].active = false;
        emit Unlisted(agentId);
    }

    /* --------------------------------- rent ---------------------------------- */

    function rent(uint256 agentId, uint64 epochId) external payable {
        Listing memory l = listings[agentId];
        if (!l.active) revert NotListed();
        if (msg.value < l.minEscrowWei) revert EscrowTooSmall();

        Grant storage g = _grants[agentId][msg.sender];
        // Integer division on purpose: a renter can only consume whole
        // decisions, and the dust stays theirs to reclaim at expiry.
        uint32 allowance = uint32(msg.value / l.feePerDecisionWei);

        g.epochId = epochId;
        g.expiry = uint64(block.timestamp) + l.termSeconds;
        g.maxDecisions += allowance;
        g.escrowedWei += msg.value;
        g.remainingWei += msg.value;
        g.paused = false;

        _assertConservation(g);
        emit Rented(agentId, msg.sender, epochId, msg.value);
    }

    /* -------------------------------- settle --------------------------------- */

    /// @notice Settle revealed slots against a grant.
    /// @dev Only slots that are actually revealed, belong to the grant's epoch,
    ///      and name this renter in their on-chain entry can be settled. That
    ///      last check is what stops an owner settling a renter's escrow against
    ///      decisions the renter never received.
    function settle(uint256 agentId, address renter, uint32[] calldata slots) external {
        Grant storage g = _grants[agentId][renter];
        if (g.escrowedWei == 0) revert NoGrant();
        if (g.paused) revert GrantPausedError();

        if (slots.length > MAX_SETTLE_SLOTS) revert TooManySlots();

        Listing memory l = listings[agentId];
        uint256 fee = l.feePerDecisionWei;
        uint256 gross = 0;
        uint32 count = 0;

        for (uint256 i = 0; i < slots.length; ++i) {
            uint32 slot = slots[i];
            if (g.remainingWei < fee) break;
            if (g.settledCount + count >= g.maxDecisions) break;
            if (slotSettled[agentId][g.epochId][slot]) continue;

            RecordBook.Entry memory e = records.entryOf(agentId, g.epochId, slot);
            if (e.revealedAt == 0) continue;
            if (e.renter != renter) continue;

            slotSettled[agentId][g.epochId][slot] = true;
            g.remainingWei -= fee;
            g.settledWei += fee;
            gross += fee;
            ++count;
        }

        if (count == 0) revert NothingToSettle();
        // Persist the consumption. Without this the allowance only bound a
        // single call and `grantOf().settledCount` always read zero.
        g.settledCount += count;
        _assertConservation(g);

        uint256 protocolWei = (gross * PROTOCOL_FEE_BPS) / BPS;
        uint256 ownerWei = gross - protocolWei;

        // Credited at settlement time, so a grant that survives an agent
        // transfer pays whoever owns it now.
        _credit(agents.ownerOf(agentId), ownerWei);
        _credit(treasury, protocolWei);

        emit Settled(agentId, renter, count, ownerWei);
    }

    /* -------------------------------- refund --------------------------------- */

    function refund(uint256 agentId) external {
        Grant storage g = _grants[agentId][msg.sender];
        if (g.escrowedWei == 0) revert NoGrant();
        // A paused renter can always exit: they are being asked to pay for a
        // brain they did not agree to.
        if (!g.paused && block.timestamp < g.expiry) revert NotExpired();

        uint256 amount = g.remainingWei;
        g.remainingWei = 0;
        g.refundedWei += amount;
        _assertConservation(g);

        _credit(msg.sender, amount);
        emit Refunded(agentId, msg.sender, amount);
    }

    /* ---------------------------- epoch consent ------------------------------ */

    /// @notice Pause a grant because the agent moved to a new epoch (I15).
    function pauseForNewEpoch(uint256 agentId, address renter, uint64 newEpochId) external {
        if (agents.ownerOf(agentId) != msg.sender) revert NotOwner();
        Grant storage g = _grants[agentId][renter];
        if (g.escrowedWei == 0) revert NoGrant();

        g.paused = true;
        emit GrantPaused(agentId, renter, newEpochId);
    }

    /// @notice The renter accepts the new epoch and the grant resumes against it.
    function consentToEpoch(uint256 agentId, uint64 epochId) external {
        Grant storage g = _grants[agentId][msg.sender];
        if (g.escrowedWei == 0) revert NoGrant();
        if (block.timestamp >= g.expiry) revert GrantExpired();

        g.epochId = epochId;
        g.paused = false;
        emit GrantResumed(agentId, msg.sender, epochId);
    }

    /* --------------------------------- views --------------------------------- */

    function grantOf(uint256 agentId, address renter) external view returns (Grant memory) {
        return _grants[agentId][renter];
    }

    function _credit(address to, uint256 amount) private {
        if (amount == 0) return;
        withdrawable[to] += amount;
        emit Credited(to, amount);
    }

    /// @notice Withdraw everything credited to the caller.
    /// @dev Balance is zeroed before the transfer, so a reentrant call finds
    ///      nothing left to take.
    function withdraw() external {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
