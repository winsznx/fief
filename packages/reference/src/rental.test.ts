import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { ZERO_HASH } from './commit.js';
import { assertConservation, consentToEpoch, refund, rent, reseal, settle } from './rental.js';
import type { Address, EntryRecord, Listing } from './types.js';
import { RejectError } from './types.js';

const RENTER = '0x00000000000000000000000000000000000000a1' as Address;
const OTHER = '0x00000000000000000000000000000000000000a2' as Address;
const PROVIDER = '0x7dcfe6aea70350c2090041524c9b4a9262dce87d' as Address;
const T0 = 1_800_000_000;

const listing = (over: Partial<Listing> = {}): Listing => ({
  agentId: '1',
  feePerDecisionWei: 1_000n,
  minEscrowWei: 10_000n,
  termSeconds: 86_400,
  active: true,
  ...over,
});

const entry = (slot: number, epochId: number, renter: Address): EntryRecord => ({
  slot,
  epochId,
  reqSha: ZERO_HASH,
  respSha: ZERO_HASH,
  provider: PROVIDER,
  teeSigner: PROVIDER,
  inputHash: ZERO_HASH,
  renter,
  decisionDigest: ZERO_HASH,
  revealedAt: T0,
});

describe('rent', () => {
  it('derives maxDecisions and expiry from the listing terms', () => {
    const g = rent({ listing: listing(), renter: RENTER, epochId: 4, valueWei: 10_500n, now: T0 });
    expect(g.maxDecisions).toBe(10); // floor(10500 / 1000), dust stays the renter's
    expect(g.expiry).toBe(T0 + 86_400);
    expect(g.epochId).toBe(4);
    assertConservation(g);
  });

  it('rejects escrow below the listing minimum', () => {
    expect(() =>
      rent({ listing: listing(), renter: RENTER, epochId: 0, valueWei: 9_999n, now: T0 }),
    ).toThrow(RejectError);
  });
});

describe('settle', () => {
  it('pays the owner net of the 200 bps protocol fee', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    const r = settle({
      grant: g,
      listing: l,
      entries: [entry(0, 4, RENTER), entry(1, 4, RENTER)],
      now: T0,
    });

    expect(r.settledSlots).toEqual([0, 1]);
    expect(r.protocolWei).toBe(40n); // 2000 * 200 / 10000
    expect(r.ownerWei).toBe(1_960n);
    assertConservation(g);
  });

  it('refuses entries from another epoch (I15)', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    const r = settle({
      grant: g,
      listing: l,
      entries: [entry(0, 5, RENTER), entry(1, 5, RENTER)],
      now: T0,
    });

    expect(r.settledSlots).toEqual([]);
    expect(g.settledWei).toBe(0n);
  });

  it('refuses entries belonging to a different renter', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    const r = settle({ grant: g, listing: l, entries: [entry(0, 4, OTHER)], now: T0 });
    expect(r.settledSlots).toEqual([]);
  });

  it('never settles the same slot twice', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    const r = settle({
      grant: g,
      listing: l,
      entries: [entry(0, 4, RENTER), entry(0, 4, RENTER)],
      now: T0,
    });
    expect(r.settledSlots).toEqual([0]);
  });

  it('stops at the allowance rather than overdrawing', () => {
    const l = listing({ feePerDecisionWei: 4_000n });
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    expect(g.maxDecisions).toBe(2);

    const r = settle({
      grant: g,
      listing: l,
      entries: [0, 1, 2, 3].map((s) => entry(s, 4, RENTER)),
      now: T0,
    });

    expect(r.settledSlots).toHaveLength(2);
    expect(g.remainingWei).toBe(2_000n); // dust, refundable
    assertConservation(g);
  });

  it('refuses to settle a paused grant', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    reseal([g]);
    expect(() => settle({ grant: g, listing: l, entries: [entry(0, 4, RENTER)], now: T0 })).toThrow(
      RejectError,
    );
  });
});

describe('reseal and consent', () => {
  it('pauses grants on epoch advance and resumes only on consent', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });

    reseal([g]);
    expect(g.paused).toBe(true);

    consentToEpoch(g, 5);
    expect(g.paused).toBe(false);
    expect(g.epochId).toBe(5);

    const r = settle({ grant: g, listing: l, entries: [entry(0, 5, RENTER)], now: T0 });
    expect(r.settledSlots).toEqual([0]);
  });

  it('a paused renter can still reclaim their escrow', () => {
    const l = listing();
    const g = rent({ listing: l, renter: RENTER, epochId: 4, valueWei: 10_000n, now: T0 });
    reseal([g]);

    expect(refund(g, T0, true)).toBe(10_000n);
    expect(g.remainingWei).toBe(0n);
    assertConservation(g);
  });
});

describe('conservation holds under arbitrary sequences (I5)', () => {
  it('escrowed == settled + refunded + remaining', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 10_000n, max: 10_000_000n }),
        fc.bigInt({ min: 1n, max: 50_000n }),
        fc.integer({ min: 0, max: 40 }),
        (value, fee, count) => {
          const l = listing({ feePerDecisionWei: fee, minEscrowWei: 1n });
          const g = rent({ listing: l, renter: RENTER, epochId: 1, valueWei: value, now: T0 });

          settle({
            grant: g,
            listing: l,
            entries: Array.from({ length: count }, (_, s) => entry(s, 1, RENTER)),
            now: T0,
          });
          refund(g, T0, true);

          assertConservation(g);
          expect(g.remainingWei).toBe(0n);
          expect(g.settledWei + g.refundedWei).toBe(value);
        },
      ),
    );
  });
});
