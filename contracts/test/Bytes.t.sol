// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Bytes} from "../src/lib/Bytes.sol";

/// @notice Differential tests for the byte helpers.
/// @dev `equalsAt` is hand-written assembly on the reveal path, and it IS the
///      security property: everything else about the commit line is untrusted
///      caller input. So it is fuzzed against a naive byte-wise implementation
///      rather than spot-checked.
contract BytesTest is Test {
    /// @dev The obvious, obviously-correct version. Slow on purpose.
    function _naive(bytes memory hay, bytes memory needle, uint256 offset)
        internal
        pure
        returns (bool)
    {
        if (offset > hay.length) return false;
        if (needle.length > hay.length - offset) return false;
        for (uint256 i = 0; i < needle.length; ++i) {
            if (hay[offset + i] != needle[i]) return false;
        }
        return true;
    }

    function testFuzz_equalsAt_matchesNaive(bytes memory hay, bytes memory needle, uint16 offRaw)
        public
        pure
    {
        uint256 off = hay.length == 0 ? 0 : offRaw % (hay.length + 1);
        assertEq(Bytes.equalsAt(hay, needle, off), _naive(hay, needle, off));
    }

    /// @notice The case that actually matters: a needle genuinely embedded in a haystack.
    function testFuzz_equalsAt_findsEmbeddedNeedle(
        bytes memory prefix,
        bytes memory needle,
        bytes memory suffix
    ) public pure {
        bytes memory hay = bytes.concat(prefix, needle, suffix);
        assertTrue(Bytes.equalsAt(hay, needle, prefix.length));
        assertEq(Bytes.equalsAt(hay, needle, prefix.length), _naive(hay, needle, prefix.length));
    }

    /// @notice A single flipped byte anywhere in the needle must be caught.
    /// @dev The tail-masking path is the easiest place to get this wrong: a
    ///      needle whose length is not a multiple of 32 has bytes the word
    ///      compare must ignore, and an off-by-one in the mask would silently
    ///      accept a corrupted last byte. That is exactly the demo's red tx.
    function testFuzz_equalsAt_detectsSingleByteFlip(
        bytes memory prefix,
        bytes memory needle,
        uint16 idxRaw
    ) public pure {
        vm.assume(needle.length > 0);
        uint256 idx = idxRaw % needle.length;

        bytes memory hay = bytes.concat(prefix, needle);
        bytes memory flipped = bytes.concat(needle);
        flipped[idx] = bytes1(uint8(flipped[idx]) ^ 0xFF);

        assertTrue(Bytes.equalsAt(hay, needle, prefix.length));
        assertFalse(Bytes.equalsAt(hay, flipped, prefix.length));
    }

    function test_equalsAt_boundsAreSafe() public pure {
        bytes memory hay = "hello world";
        assertFalse(Bytes.equalsAt(hay, "world", 100));
        assertFalse(Bytes.equalsAt(hay, "world!!!!!!!!!!!!", 6));
        assertTrue(Bytes.equalsAt(hay, "world", 6));
        assertTrue(Bytes.equalsAt(hay, "", 0));
        assertTrue(Bytes.equalsAt(hay, "", hay.length));
    }

    /// @notice Needle lengths straddling the 32-byte word boundary.
    function test_equalsAt_wordBoundaries() public pure {
        for (uint256 len = 30; len <= 34; ++len) {
            bytes memory needle = new bytes(len);
            for (uint256 i = 0; i < len; ++i) needle[i] = bytes1(uint8(65 + (i % 26)));
            bytes memory hay = bytes.concat("PAD", needle, "TAIL");

            assertTrue(Bytes.equalsAt(hay, needle, 3), "exact");

            bytes memory bad = bytes.concat(needle);
            bad[len - 1] = 0x00; // last byte, the masked-tail case
            assertFalse(Bytes.equalsAt(hay, bad, 3), "last byte flip");
        }
    }

    /* ------------------------------- encodings ------------------------------- */

    function test_hexAddress_isLowercaseAnd42Bytes() public pure {
        bytes memory h = Bytes.hexAddress(0xabCDeF0123456789AbcdEf0123456789aBCDEF01);
        assertEq(h.length, 42);
        assertEq(string(h), "0xabcdef0123456789abcdef0123456789abcdef01");
    }

    function test_hexBytes32_is66Bytes() public pure {
        bytes memory h = Bytes.hexBytes32(bytes32(uint256(0xdeadbeef)));
        assertEq(h.length, 66);
        assertEq(
            string(h), "0x00000000000000000000000000000000000000000000000000000000deadbeef"
        );
    }

    function test_decimal() public pure {
        assertEq(string(Bytes.decimal(0)), "0");
        assertEq(string(Bytes.decimal(7)), "7");
        assertEq(string(Bytes.decimal(16661)), "16661");
        assertEq(
            string(Bytes.decimal(type(uint256).max)),
            "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
    }

    function testFuzz_decimal_roundTrips(uint256 v) public pure {
        assertEq(vm.parseUint(string(Bytes.decimal(v))), v);
    }
}
