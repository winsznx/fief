// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice Loader for the reference model's fixture vectors (PRD v2 §11).
/// @dev Contract tests import these and never restate expected values inline.
///      If Solidity and `packages/reference` disagree, exactly one is wrong and
///      the fixture is the arbiter.
library Fixtures {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    string internal constant PATH = "../packages/reference/fixtures/slots.json";

    struct Vector {
        string name;
        bool honest;
        uint32 slot;
        string commitLine;
        string exp;
        bytes respData;
        uint32 commitOffset;
        bytes32 reqSha;
        bytes32 respSha;
        bytes signature;
        bytes32 receiptCommit;
        bytes32 inputHash;
        address renter;
        bytes32 salt;
        uint64 snapshotTime;
        uint64 commitDeadline;
        uint64 revealOpen;
        string expectedReject;
    }

    struct Bundle {
        uint256 chainId;
        address book;
        uint256 agentId;
        uint64 epochId;
        address operator;
        address provider;
        address teeSigner;
        bytes32 strategyHash;
        uint32 cadenceSeconds;
        uint32 horizonSeconds;
        uint32 maxCommitDelay;
        uint32 disclosureDelay;
        uint64 startTime;
        uint32 slotCount;
    }

    function json() internal view returns (string memory) {
        return vm.readFile(PATH);
    }

    function bundle() internal view returns (Bundle memory b) {
        string memory j = json();
        b.chainId = vm.parseJsonUint(j, ".chainId");
        b.book = vm.parseJsonAddress(j, ".book");
        b.agentId = vm.parseJsonUint(j, ".agentId");
        b.epochId = uint64(vm.parseJsonUint(j, ".epochId"));
        b.operator = vm.parseJsonAddress(j, ".operator");
        b.provider = vm.parseJsonAddress(j, ".provider");
        b.teeSigner = vm.parseJsonAddress(j, ".teeSigner");
        b.strategyHash = vm.parseJsonBytes32(j, ".spec.strategyHash");
        b.cadenceSeconds = uint32(vm.parseJsonUint(j, ".spec.cadenceSeconds"));
        b.horizonSeconds = uint32(vm.parseJsonUint(j, ".spec.horizonSeconds"));
        b.maxCommitDelay = uint32(vm.parseJsonUint(j, ".spec.maxCommitDelay"));
        b.disclosureDelay = uint32(vm.parseJsonUint(j, ".spec.disclosureDelay"));
        b.startTime = uint64(vm.parseJsonUint(j, ".spec.startTime"));
        b.slotCount = uint32(vm.parseJsonUint(j, ".spec.slotCount"));
    }

    /// @dev Read from an explicit field: Foundry's JSON cheatcodes have no `[*]`
    ///      wildcard, so the generator publishes the count.
    function count() internal view returns (uint256) {
        return vm.parseJsonUint(json(), ".vectorCount");
    }

    function vector(uint256 i) internal view returns (Vector memory v) {
        string memory j = json();
        string memory p = string.concat(".vectors[", vm.toString(i), "]");

        v.name = vm.parseJsonString(j, string.concat(p, ".name"));
        v.slot = uint32(vm.parseJsonUint(j, string.concat(p, ".slot")));
        v.commitLine = vm.parseJsonString(j, string.concat(p, ".commitLine"));
        v.exp = vm.parseJsonString(j, string.concat(p, ".exp"));
        // respData is UTF-8 text in the fixture; the contract hashes raw bytes.
        v.respData = bytes(vm.parseJsonString(j, string.concat(p, ".respData")));
        v.commitOffset = uint32(vm.parseJsonUint(j, string.concat(p, ".commitOffset")));
        v.reqSha = vm.parseJsonBytes32(j, string.concat(p, ".reqSha"));
        v.respSha = vm.parseJsonBytes32(j, string.concat(p, ".respSha"));
        v.signature = vm.parseJsonBytes(j, string.concat(p, ".signature"));
        v.receiptCommit = vm.parseJsonBytes32(j, string.concat(p, ".receiptCommit"));
        v.inputHash = vm.parseJsonBytes32(j, string.concat(p, ".inputHash"));
        v.renter = vm.parseJsonAddress(j, string.concat(p, ".renter"));
        v.salt = vm.parseJsonBytes32(j, string.concat(p, ".salt"));
        v.snapshotTime = uint64(vm.parseJsonUint(j, string.concat(p, ".snapshotTime")));
        v.commitDeadline = uint64(vm.parseJsonUint(j, string.concat(p, ".commitDeadline")));
        v.revealOpen = uint64(vm.parseJsonUint(j, string.concat(p, ".revealOpen")));

        // Read the explicit boolean rather than inferring from `expectedReject`.
        // A JSON null comes back through the cheatcodes as the literal string
        // "null", which silently inverted the honest/adversarial split.
        v.honest = vm.parseJsonBool(j, string.concat(p, ".honest"));
    }

    function isHonest(Vector memory v) internal pure returns (bool) {
        return v.honest;
    }
}
