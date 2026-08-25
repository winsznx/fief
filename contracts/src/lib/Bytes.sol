// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Byte and ASCII helpers used to rebuild the FIEF commit line on-chain.
/// @notice Every encoding here must match `packages/reference/src/commit.ts`
///         byte-for-byte. The reference fixtures are the arbiter: if these
///         disagree, the Foundry suite fails rather than the chain accepting a
///         line the runtime would never produce.
library Bytes {
    bytes16 private constant HEX = "0123456789abcdef";

    /// @dev Lowercase hex, no `0x` prefix. 64 ASCII bytes.
    function hexNoPrefix(bytes32 value) internal pure returns (bytes memory out) {
        out = new bytes(64);
        for (uint256 i = 0; i < 32; ++i) {
            uint8 b = uint8(value[i]);
            out[i * 2] = HEX[b >> 4];
            out[i * 2 + 1] = HEX[b & 0x0f];
        }
    }

    /// @dev Lowercase hex with `0x` prefix. 66 ASCII bytes.
    function hexBytes32(bytes32 value) internal pure returns (bytes memory) {
        return abi.encodePacked("0x", hexNoPrefix(value));
    }

    /// @dev Lowercase hex with `0x` prefix. 42 ASCII bytes.
    ///      Never checksummed: the commit line is canonically lowercase so the
    ///      bytes are reproducible without knowing EIP-55.
    function hexAddress(address value) internal pure returns (bytes memory out) {
        out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(value);
        for (uint256 i = 0; i < 20; ++i) {
            uint8 b = uint8(v >> (8 * (19 - i)));
            out[2 + i * 2] = HEX[b >> 4];
            out[2 + i * 2 + 1] = HEX[b & 0x0f];
        }
    }

    /// @dev Decimal ASCII, no padding, no sign.
    function decimal(uint256 value) internal pure returns (bytes memory) {
        if (value == 0) return "0";

        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) ++digits;

        bytes memory out = new bytes(digits);
        for (uint256 i = digits; i > 0; --i) {
            out[i - 1] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return out;
    }

    /// @notice Constant-length memcmp of `needle` against `haystack[offset..]`.
    /// @dev `offset` is untrusted caller input. Bounds are checked here, and the
    ///      comparison itself is the security property: the needle is derived
    ///      from on-chain state, so it cannot be forged into a TEE-signed
    ///      response no matter what offset is supplied.
    function equalsAt(bytes memory haystack, bytes memory needle, uint256 offset)
        internal
        pure
        returns (bool)
    {
        unchecked {
            if (offset > haystack.length) return false;
            uint256 n = needle.length;
            if (n > haystack.length - offset) return false;

            // Word-at-a-time. The needle is ~300 bytes, so byte-wise indexing
            // costs a memory load and bounds check per byte; comparing 32 at a
            // time is an order of magnitude cheaper on the hot reveal path.
            bool same = true;
            assembly {
                let h := add(add(haystack, 0x20), offset)
                let nd := add(needle, 0x20)
                let words := div(n, 0x20)

                for {let i := 0} lt(i, words) {i := add(i, 1)} {
                    let off := mul(i, 0x20)
                    if iszero(eq(mload(add(h, off)), mload(add(nd, off)))) {
                        same := 0
                        break
                    }
                }

                // Tail: mask off the bytes past the needle's end so we never
                // compare data that belongs to the haystack.
                if same {
                    let rem := mod(n, 0x20)
                    if rem {
                        let off := mul(words, 0x20)
                        let mask := not(sub(shl(mul(sub(0x20, rem), 8), 1), 1))
                        if iszero(
                            eq(and(mload(add(h, off)), mask), and(mload(add(nd, off)), mask))
                        ) { same := 0 }
                    }
                }
            }
            return same;
        }
    }
}
