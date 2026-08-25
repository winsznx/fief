// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal view surface of 0G's InferenceServing contract.
/// @dev Mainnet `0x47340d900bdFec2BD393c626E12ea0656F938d84`, testnet
///      `0xa79F4c8311FF93C06b8CfB403690cc987c93F91E`.
///
///      Only the two fields Fief actually needs are consumed. The real struct
///      has more members; ABI decoding is positional, so the shape below must
///      match the head of the real one. Confirmed live on 2026-08-25 against
///      provider `0x7DCFe6…e87D`, whose acknowledged TEE signer is
///      `0xA46EA4FC…46B9` (PRD v2 §0.6.1).
interface IInferenceServing {
    struct Service {
        address provider;
        string serviceType;
        string url;
        uint256 inputPrice;
        uint256 outputPrice;
        uint256 updatedAt;
        string model;
        string verifiability;
        string additionalInfo;
        address teeSignerAddress;
        bool teeSignerAcknowledged;
    }

    function getService(address provider) external view returns (Service memory);
}
