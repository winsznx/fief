/**
 * The frontend's commit-line bytes must equal the reference model's.
 *
 * `packages/reference` is the specification: the Solidity suite imports its
 * fixtures, and the runtime builds real mainnet transactions from it. If this
 * file drifts, the UI would render a commit line the chain would reject, which
 * is exactly how the v1 `nonce:` form survived here after v2 moved to `slot:`.
 *
 * The reference package is a devDependency only, so nothing here reaches the
 * browser bundle.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCommitLine as refBuildCommitLine,
  buildExpectedCommit as refBuildExpectedCommit,
  CONTENT_ANCHOR as REF_ANCHOR,
  ZERO_ADDRESS as REF_ZERO,
} from '@fief/reference';

import { buildCommitLine, buildExpectedCommit, CONTENT_ANCHOR, ZERO_ADDRESS } from './commit';

const parts = {
  book: '0x00000000000000000000000000000000000000b0' as `0x${string}`,
  chainId: 16661,
  tokenId: '5',
  epoch: 0,
  slot: 182,
  strategyHash: `0x${'ab'.repeat(32)}` as `0x${string}`,
  inputHash: `0x${'cd'.repeat(32)}` as `0x${string}`,
  renter: ZERO_ADDRESS,
};

const refParts = {
  book: parts.book,
  chainId: parts.chainId,
  agentId: parts.tokenId,
  epochId: parts.epoch,
  slot: parts.slot,
  strategyHash: parts.strategyHash,
  inputHash: parts.inputHash,
  renter: parts.renter,
};

describe('commit-line parity with @fief/reference', () => {
  it('constants agree', () => {
    expect(CONTENT_ANCHOR).toBe(REF_ANCHOR);
    expect(ZERO_ADDRESS).toBe(REF_ZERO);
  });

  it('buildCommitLine is byte-identical', () => {
    expect(buildCommitLine(parts)).toBe(refBuildCommitLine(refParts));
  });

  it('buildExpectedCommit is byte-identical', () => {
    expect(buildExpectedCommit(parts)).toBe(refBuildExpectedCommit(refParts));
  });

  it('uses slot, not the retired v1 nonce field', () => {
    const line = buildCommitLine(parts);
    expect(line).toContain('|slot:182|');
    expect(line).not.toContain('nonce:');
  });

  it('agrees across a spread of inputs', () => {
    for (const [epoch, slot, id] of [[0, 0, '1'], [7, 143, '12'], [255, 4095, '999']] as const) {
      const a = { ...parts, epoch, slot, tokenId: id };
      const b = { ...refParts, epochId: epoch, slot, agentId: id };
      expect(buildCommitLine(a)).toBe(refBuildCommitLine(b));
    }
  });
});
