// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IInferenceServing} from "../../src/interfaces/IInferenceServing.sol";

/// @notice Stand-in for 0G's InferenceServing during local tests.
/// @dev Only the two fields RecordBook reads are meaningful. The live shape was
///      confirmed against mainnet on 2026-08-25 (PRD v2 §0.6.1); P3 exercises
///      the real contract on testnet.
contract MockInferenceServing is IInferenceServing {
    mapping(address => address) public signerOf;
    mapping(address => bool) public acknowledgedOf;
    mapping(address => bool) public revertsFor;

    function set(address provider, address signer, bool acknowledged) external {
        signerOf[provider] = signer;
        acknowledgedOf[provider] = acknowledged;
    }

    function setReverts(address provider, bool doesRevert) external {
        revertsFor[provider] = doesRevert;
    }

    function getService(address provider) external view returns (Service memory s) {
        require(!revertsFor[provider], "provider unknown");
        s.provider = provider;
        s.serviceType = "inference";
        s.url = "https://example.invalid/v1/proxy";
        s.model = "glm-5.2";
        s.verifiability = "TeeML";
        s.teeSignerAddress = signerOf[provider];
        s.teeSignerAcknowledged = acknowledgedOf[provider];
    }
}
