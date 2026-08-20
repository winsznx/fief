import { describe, expect, it } from 'vitest';
import { firstDiffIndex } from './commit';
import {
  getAgents,
  getEntriesFor,
  getShowcasePair,
  getStressEntries,
  GREEN_TX,
  RED_TX,
} from './fixtures';
import type { RejectReason } from './types';

const HEX32 = /^0x[0-9a-f]{64}$/;
const HEX20 = /^0x[0-9a-f]{40}$/;

const ALL_REASONS: RejectReason[] = [
  'BadCommit',
  'BadSigner',
  'BadNonce',
  'BadEpoch',
  'BadHash',
  'NotOperator',
  'BadAnchor',
];

describe('fixture hex widths', () => {
  // Regression guard: the hand-written hash constants were originally 65 hex
  // characters, which the commit-line width test caught. Assert every emitted
  // value, not just the constants.
  it('every agent field is a canonical width', () => {
    for (const a of getAgents()) {
      expect(a.owner, `agent ${a.tokenId} owner`).toMatch(HEX20);
      expect(a.operator, `agent ${a.tokenId} operator`).toMatch(HEX20);
      expect(a.strategyHash, `agent ${a.tokenId} strategyHash`).toMatch(HEX32);
      expect(a.storageRoot, `agent ${a.tokenId} storageRoot`).toMatch(HEX32);
    }
  });

  it('every entry field is a canonical width', () => {
    for (const a of getAgents()) {
      for (const e of getEntriesFor(a.tokenId)) {
        expect(e.reqSha).toMatch(HEX32);
        expect(e.respSha).toMatch(HEX32);
        expect(e.inputHash).toMatch(HEX32);
        expect(e.txHash).toMatch(HEX32);
        expect(e.teeSigner).toMatch(HEX20);
        expect(e.provider).toMatch(HEX20);
        expect(e.renter).toMatch(HEX20);
      }
    }
  });
});

describe('determinism', () => {
  it('returns identical data across calls, so screenshots are stable', () => {
    const a = JSON.stringify(getEntriesFor('2'));
    const b = JSON.stringify(getEntriesFor('2'));
    expect(a).toBe(b);
  });

  it('memoises rather than regenerating', () => {
    expect(getEntriesFor('1')).toBe(getEntriesFor('1'));
  });
});

describe('shape required by the handoff', () => {
  it('has at least 2 agents', () => {
    expect(getAgents().length).toBeGreaterThanOrEqual(2);
  });

  it('has an agent whose ledger contains both accepted and a BadCommit rejection', () => {
    const list = getEntriesFor('1');
    expect(list.some((e) => e.status === 'accepted')).toBe(true);
    expect(list.some((e) => e.rejectReason === 'BadCommit')).toBe(true);
  });

  it('exercises all 7 reject reasons somewhere in the fixture', () => {
    const seen = new Set<RejectReason>();
    for (const a of getAgents()) {
      for (const e of getEntriesFor(a.tokenId)) {
        if (e.rejectReason) seen.add(e.rejectReason);
      }
    }
    for (const r of ALL_REASONS) expect(seen.has(r), `missing ${r}`).toBe(true);
  });

  it('covers the ledger edge cases: 1 entry and 0 entries', () => {
    expect(getEntriesFor('3')).toHaveLength(1);
    expect(getEntriesFor('4')).toHaveLength(0);
  });

  it('includes an agent past epoch 1 to exercise the epoch boundary', () => {
    expect(getAgents().some((a) => a.epoch > 1)).toBe(true);
  });

  it('produces working ChainScan URLs', () => {
    for (const e of getEntriesFor('3')) {
      expect(e.chainScanUrl).toBe(`https://chainscan.0g.ai/tx/${e.txHash}`);
    }
  });
});

describe('derived metrics', () => {
  it('derives brainBoundPct from entries rather than hardcoding it', () => {
    for (const a of getAgents()) {
      const list = getEntriesFor(a.tokenId);
      if (list.length === 0) {
        expect(a.brainBoundPct).toBe(100);
        continue;
      }
      const accepted = list.filter((e) => e.status === 'accepted').length;
      const expected = Math.round((accepted / list.length) * 100 * 100) / 100;
      expect(a.brainBoundPct).toBeCloseTo(expected, 2);
    }
  });

  it('counts decisionCount as accepted entries only', () => {
    for (const a of getAgents()) {
      const accepted = getEntriesFor(a.tokenId).filter((e) => e.status === 'accepted').length;
      expect(a.decisionCount).toBe(accepted);
    }
  });

  it('keeps nonces strictly increasing across accepted entries (PRD I2)', () => {
    for (const a of getAgents()) {
      const accepted = getEntriesFor(a.tokenId).filter((e) => e.status === 'accepted');
      accepted.forEach((e, i) => {
        expect(e.nonce).toBe(i + 1);
      });
    }
  });
});

describe('canonical showcase pair', () => {
  const { green, red } = getShowcasePair();

  it('is pinned to the documented demo transaction hashes', () => {
    expect(green.txHash).toBe(GREEN_TX);
    expect(red.txHash).toBe(RED_TX);
  });

  it('carries respData bytes for the byte-diff reveal', () => {
    expect(green.respData).toBeTruthy();
    expect(red.respData).toBeTruthy();
    expect(green.commitOffset).toBeGreaterThan(0);
    expect(red.commitOffset).toBeGreaterThan(0);
  });

  it('is the SAME submission — same nonce, input and request hash', () => {
    // PRD §2: "the same submission with one tampered byte".
    expect(red.nonce).toBe(green.nonce);
    expect(red.inputHash).toBe(green.inputHash);
    expect(red.reqSha).toBe(green.reqSha);
    expect(red.decision).toEqual(green.decision);
  });

  it('differs by EXACTLY ONE byte', () => {
    const a = green.respData ?? '';
    const b = red.respData ?? '';
    expect(a).toHaveLength(b.length);
    let diffs = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diffs += 1;
    expect(diffs).toBe(1);
  });

  it('locates that byte inside the strategy field of the commit line', () => {
    const a = green.respData ?? '';
    const b = red.respData ?? '';
    const at = firstDiffIndex(a, b);
    const strategyAt = a.indexOf('|strategy:0x');
    expect(strategyAt).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(strategyAt);
    expect(at).toBeLessThan(strategyAt + '|strategy:0x'.length + 64);
  });

  it('marks the red entry BadCommit', () => {
    expect(red.status).toBe('rejected');
    expect(red.rejectReason).toBe('BadCommit');
  });
});

describe('stress fixture', () => {
  it('generates 10k entries for the §5.4 virtualization requirement', () => {
    const list = getStressEntries();
    expect(list).toHaveLength(10_000);
    expect(list[9_999].index).toBe(9_999);
  });
});
