// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Bytes} from "./lib/Bytes.sol";

/// @title TeemlReceiptVerifier
/// @notice Stateless on-chain verification of 0G Compute TeeML inference receipts.
///
/// @dev This is deliberately reusable and dependency-free so it can be published
///      standalone (PRD v2 §15). It is also the piece that makes Fief's check
///      strictly stronger than 0G's own client SDK: `processResponse` in the
///      0g-compute-ts-sdk package trusts the provider-returned `text` and only
///      ecrecovers it, so a provider returning a signature over bytes it did
///      not actually serve passes the SDK. Here the text is rebuilt from the
///      real request and response hashes before recovery, so it cannot.
///
///      Format confirmed byte-exact against a live mainnet TeeML provider on
///      2026-08-25 (PRD v2 §0.6.1): the signed text is
///      `sha256hex(reqBody) ":" sha256hex(respData)`, lowercase, exactly 129
///      ASCII bytes, signed as an EIP-191 personal message.
library TeemlReceiptVerifier {
    /// @dev The signed text is always 129 bytes, so the EIP-191 length prefix is
    ///      a constant rather than something to compute. A drift in that length
    ///      would otherwise be a silent verification failure.
    bytes private constant EIP191_PREFIX = "\x19Ethereum Signed Message:\n129";

    /// @notice Rebuild the exact 129-byte text the enclave signed.
    function signedText(bytes32 reqSha, bytes32 respSha) internal pure returns (bytes memory) {
        return abi.encodePacked(Bytes.hexNoPrefix(reqSha), ":", Bytes.hexNoPrefix(respSha));
    }

    /// @notice EIP-191 personal-message digest over the rebuilt text.
    function digest(bytes32 reqSha, bytes32 respSha) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(EIP191_PREFIX, signedText(reqSha, respSha)));
    }

    /// @notice Recover the enclave key that signed this receipt.
    /// @param respData The exact response bytes served by the provider.
    /// @param reqSha   sha256 of the exact request bytes, sealed on-chain.
    /// @param signature 65-byte ECDSA signature, v as 27/28.
    /// @return signer  Recovered address, or address(0) if the signature is malformed.
    /// @return respSha The on-chain recomputed sha256 of `respData`.
    function recover(bytes memory respData, bytes32 reqSha, bytes memory signature)
        internal
        pure
        returns (address signer, bytes32 respSha)
    {
        respSha = sha256(respData);
        if (signature.length != 65) return (address(0), respSha);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return (address(0), respSha);

        // Reject the malleable upper half of the curve order. ecrecover accepts
        // it, which would let the same receipt be replayed under a second
        // distinct signature.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return (address(0), respSha);
        }

        signer = ecrecover(digest(reqSha, respSha), v, r, s);
    }

    /// @notice Full check: the receipt must recover to `expectedSigner`.
    function verify(
        bytes memory respData,
        bytes32 reqSha,
        bytes memory signature,
        address expectedSigner
    ) internal pure returns (bool ok, bytes32 respSha) {
        address signer;
        (signer, respSha) = recover(respData, reqSha, signature);
        ok = signer != address(0) && signer == expectedSigner;
    }
}
