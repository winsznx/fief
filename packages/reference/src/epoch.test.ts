import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  REVEAL_GRACE_SECONDS,
  abandonEpoch,
  epochEnd,
  epochSummary,
  finalizeEpoch,
  openEpoch,
  resolveSlot,
  slotCommitDeadline,
  slotRevealOpen,
  slotSchedule,
  slotSnapshotTime,
} from './epoch.js';
import { ZERO_HASH } from './commit.js';
import type { Address, CommitRecord, EpochSpec } from './types.js';
import { RejectError } from './types.js';

const PROVIDER = '0x7dcfe6aea70350c2090041524c9b4a9262dce87d' as Address;
const T0 = 1_800_000_000;

const spec = (over: Partial<EpochSpec> = {}): EpochSpec => ({
  market: 'BTC-USDT',
  cadenceSeconds: 300,
  horizonSeconds: 300,
  maxCommitDelay: 30,
  disclosureDelay: 60,
  startTime: T0,
  slotCount: 12,
  strategyHash: ZERO_HASH,
  providerSet: [PROVIDER],
  ...over,
});

const commit = (at: number): CommitRecord => ({
  reqSha: ZERO_HASH,
  respSha: ZERO_HASH,
  receiptCommit: ZERO_HASH,
  provider: PROVIDER,
  committedAt: at,
});

describe('epoch spec validation (I11)', () => {
  it('rejects an epoch whose window is already in the past', () => {
    // The whole prospective claim rests on this: an epoch opened over resolved
    // outcomes would let an operator "commit" to what it already knows.
    expect(() => openEpoch(spec({ startTime: T0 - 1 }), T0)).toThrow(RejectError);
  });

  it('accepts an epoch starting now or later', () => {
    expect(() => openEpoch(spec({ startTime: T0 }), T0)).not.toThrow();
    expect(() => openEpoch(spec({ startTime: T0 + 5000 }), T0)).not.toThrow();
  });

  it('rejects a commit deadline that would overlap the next slot', () => {
    expect(() => openEpoch(spec({ maxCommitDelay: 300 }), T0)).toThrow(RejectError);
  });

  it('rejects an empty provider set', () => {
    expect(() => openEpoch(spec({ providerSet: [] }), T0)).toThrow(RejectError);
  });
});

describe('slot schedule derivation', () => {
  it('derives snapshot, deadline and reveal times from the spec alone', () => {
    const s = spec();
    expect(slotSnapshotTime(s, 0)).toBe(T0);
    expect(slotSnapshotTime(s, 3)).toBe(T0 + 900);
    expect(slotCommitDeadline(s, 3)).toBe(T0 + 900 + 30);
    expect(slotRevealOpen(s, 3)).toBe(T0 + 900 + 300 + 60);
    expect(epochEnd(s)).toBe(T0 + 11 * 300 + 30);
    expect(slotSchedule(s)).toHaveLength(12);
  });
});

describe('slot resolution is total (I13)', () => {
  it('accepts a commit exactly at the deadline and misses one second later', () => {
    const st = openEpoch(spec(), T0 - 1);
    const deadline = slotCommitDeadline(st.spec, 0);

    expect(resolveSlot(st, 0, deadline)).toBe('scheduled');
    expect(resolveSlot(st, 0, deadline + 1)).toBe('missed');
  });

  it('a committed slot stays committed until revealed, then goes invalid only after the grace', () => {
    const st = openEpoch(spec(), T0 - 1);
    st.commits.set(0, commit(T0 + 5));

    const graceEnd = slotRevealOpen(st.spec, 0) + REVEAL_GRACE_SECONDS;
    expect(resolveSlot(st, 0, graceEnd)).toBe('committed');

    // Nobody opened the commitment in time, so it never became a proven
    // decision. Note this is time-driven: a failed reveal attempt cannot cause
    // it, because reveal is permissionless and that would be griefable.
    expect(resolveSlot(st, 0, graceEnd + 1)).toBe('invalid');
  });

  it('abandonment resolves every remaining slot to missed', () => {
    const st = openEpoch(spec(), T0 - 1);
    st.commits.set(0, commit(T0 + 5));
    abandonEpoch(st, T0 + 100);

    expect(resolveSlot(st, 0, T0 + 200)).toBe('committed');
    for (let i = 1; i < st.spec.slotCount; i += 1) {
      expect(resolveSlot(st, i, T0 + 200)).toBe('missed');
    }
  });

  it('rejects an out-of-range slot rather than inventing a state', () => {
    const st = openEpoch(spec(), T0 - 1);
    expect(() => resolveSlot(st, -1, T0)).toThrow(RejectError);
    expect(() => resolveSlot(st, 12, T0)).toThrow(RejectError);
  });

  it('every scheduled slot is accounted for, over arbitrary commit patterns', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { maxLength: 12 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { maxLength: 12 }),
        (committed, revealed) => {
          const st = openEpoch(spec(), T0 - 1);
          for (const s of committed) st.commits.set(s, commit(T0 + s * 300));
          for (const s of revealed) {
            if (!st.commits.has(s)) continue;
            st.entries.set(s, {
              slot: s,
              epochId: 0,
              reqSha: ZERO_HASH,
              respSha: ZERO_HASH,
              provider: PROVIDER,
              teeSigner: PROVIDER,
              inputHash: ZERO_HASH,
              renter: PROVIDER,
              decisionDigest: ZERO_HASH,
              revealedAt: T0 + 10_000,
            });
          }

          const after = epochEnd(st.spec) + 1;
          const sum = epochSummary(st, after);

          // I13, the completeness invariant.
          expect(sum.committed + sum.missed).toBe(sum.slotCount);
          expect(sum.revealed + sum.invalid).toBeLessThanOrEqual(sum.committed);
          expect(sum.completeness).toBeCloseTo(sum.revealed / sum.slotCount, 12);
        },
      ),
    );
  });
});

describe('finalizeEpoch', () => {
  it('refuses to finalize before the epoch can no longer change', () => {
    const st = openEpoch(spec(), T0 - 1);
    expect(() => finalizeEpoch(st, epochEnd(st.spec))).toThrow(RejectError);
  });

  it('a fully missed epoch reports honestly rather than empty', () => {
    const st = openEpoch(spec(), T0 - 1);
    const sum = finalizeEpoch(st, epochEnd(st.spec) + 1);

    expect(sum.committed).toBe(0);
    expect(sum.missed).toBe(12);
    expect(sum.revealed).toBe(0);
    expect(sum.completeness).toBe(0);
  });

  it('dropping the losing half of an epoch is visible, not silent', () => {
    // The v1 omission attack, replayed against v2: an operator commits only the
    // six slots it liked. v1 would have shown six clean entries and nothing
    // else. v2 shows 50% completeness.
    const st = openEpoch(spec(), T0 - 1);
    for (const s of [0, 2, 4, 6, 8, 10]) {
      st.commits.set(s, commit(slotSnapshotTime(st.spec, s) + 5));
      st.entries.set(s, {
        slot: s,
        epochId: 0,
        reqSha: ZERO_HASH,
        respSha: ZERO_HASH,
        provider: PROVIDER,
        teeSigner: PROVIDER,
        inputHash: ZERO_HASH,
        renter: PROVIDER,
        decisionDigest: ZERO_HASH,
        revealedAt: T0 + 10_000,
      });
    }

    const sum = finalizeEpoch(st, epochEnd(st.spec) + 1);
    expect(sum.revealed).toBe(6);
    expect(sum.missed).toBe(6);
    expect(sum.completeness).toBe(0.5);
  });
});
