import { describe, expect, it } from 'vitest';
import { firstDiffIndex } from './commit';
import {
  getAgents,
  getEntriesFor,
  getShowcasePair,
  getStressEntries,
  getTamperTests,
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
    const all = [...getAgents().flatMap((a) => getEntriesFor(a.tokenId)), ...getTamperTests()];
    for (const e of all) {
      expect(e.reqSha).toMatch(HEX32);
      expect(e.respSha).toMatch(HEX32);
      expect(e.inputHash).toMatch(HEX32);
      expect(e.txHash).toMatch(HEX32);
      expect(e.teeSigner).toMatch(HEX20);
      expect(e.provider).toMatch(HEX20);
      expect(e.renter).toMatch(HEX20);
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
    expect(getTamperTests()).toBe(getTamperTests());
  });
});

describe('shape required by the handoff', () => {
  it('has at least 2 agents', () => {
    expect(getAgents().length).toBeGreaterThanOrEqual(2);
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

/* ── v1.1 Q1: ledgers are accepted-only, tamper tests are separate ────────── */

describe('ledgers are accepted-only (v1.1 Q1)', () => {
  it('contains no rejected entry in any agent ledger', () => {
    for (const a of getAgents()) {
      for (const e of getEntriesFor(a.tokenId)) {
        expect(e.status, `agent ${a.tokenId} entry ${e.entryIndex}`).toBe('accepted');
        expect(e.rejectReason).toBeUndefined();
        expect(e.isTamperTest).toBeUndefined();
      }
    }
  });

  it('keeps entryIndex contiguous from 0 within each ledger', () => {
    // The on-chain array cannot have gaps: a rejected submission never occupies
    // a slot, so the index IS the position.
    for (const a of getAgents()) {
      getEntriesFor(a.tokenId).forEach((e, i) => {
        expect(e.entryIndex, `agent ${a.tokenId} position ${i}`).toBe(i);
      });
    }
  });

  it('keeps nonces strictly increasing across each ledger (PRD I2)', () => {
    for (const a of getAgents()) {
      getEntriesFor(a.tokenId).forEach((e, i) => {
        expect(e.nonce).toBe(i + 1);
      });
    }
  });

  it('counts decisionCount as the accepted, stored entries', () => {
    for (const a of getAgents()) {
      expect(a.decisionCount).toBe(getEntriesFor(a.tokenId).length);
    }
  });

  it('reports provenance as a verified literal, never a fraction', () => {
    for (const a of getAgents()) {
      expect(a.verified).toBe(true);
      // D15: the shape itself must not carry a percentage.
      expect(a).not.toHaveProperty('brainBoundPct');
    }
  });
});

describe('tamper tests (v1.1 Q1)', () => {
  const tests = getTamperTests();

  it('are all rejected, flagged, and have no entry index', () => {
    expect(tests.length).toBeGreaterThan(0);
    for (const e of tests) {
      expect(e.entryIndex, `${e.rejectReason} entryIndex`).toBeNull();
      expect(e.isTamperTest, `${e.rejectReason} isTamperTest`).toBe(true);
      expect(e.status).toBe('rejected');
      expect(e.rejectReason).toBeDefined();
    }
  });

  it('exercises all 7 reject reasons, so every red receipt variant is reachable', () => {
    const seen = new Set(tests.map((e) => e.rejectReason));
    for (const r of ALL_REASONS) expect(seen.has(r), `missing ${r}`).toBe(true);
  });

  it('appears in no agent ledger', () => {
    const ledgerHashes = new Set(
      getAgents().flatMap((a) => getEntriesFor(a.tokenId).map((e) => e.txHash)),
    );
    for (const e of tests) {
      expect(ledgerHashes.has(e.txHash), `${e.rejectReason} leaked into a ledger`).toBe(false);
    }
  });

  it('uses distinct transaction hashes', () => {
    expect(new Set(tests.map((e) => e.txHash)).size).toBe(tests.length);
  });
});

describe('canonical showcase pair', () => {
  const { green, red } = getShowcasePair();

  it('is pinned to the documented demo transaction hashes', () => {
    expect(green.txHash).toBe(GREEN_TX);
    expect(red.txHash).toBe(RED_TX);
  });

  it('pairs a real stored entry with a tamper test (D14)', () => {
    expect(green.entryIndex).not.toBeNull();
    expect(red.entryIndex).toBeNull();
    expect(red.isTamperTest).toBe(true);
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
  it('generates 10k accepted entries for the §5.4 virtualization requirement', () => {
    const list = getStressEntries();
    expect(list).toHaveLength(10_000);
    expect(list[9_999].entryIndex).toBe(9_999);
    expect(list.every((e) => e.status === 'accepted')).toBe(true);
  });
});
