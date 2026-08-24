import { describe, expect, it } from 'vitest';
import { getEntriesFor, getListings, getTamperTests, GREEN_TX, RED_TX } from './fixtures';
import { mockDataSource } from './mock';

/**
 * Behavioural coverage for the v1.1 (A3) mock boundary.
 *
 * These are the paths where a shape change could silently produce a wrong
 * NUMBER rather than a type error: the rent derivation is wei arithmetic, and
 * verifyTx's four outcomes each drive a different UI state.
 */

describe('getEntry(txHash) — v1.1 Q1 routing key', () => {
  it('resolves an accepted ledger entry and attaches its respData bytes', async () => {
    const entry = await mockDataSource.getEntry(GREEN_TX);
    expect(entry).not.toBeNull();
    expect(entry?.txHash).toBe(GREEN_TX);
    expect(entry?.status).toBe('accepted');
    expect(entry?.entryIndex).toBe(0);
    expect(entry?.respData).toBeTruthy();
  });

  it('also resolves a tamper test, so a shared link renders instead of 404ing (D13)', async () => {
    const entry = await mockDataSource.getEntry(RED_TX);
    expect(entry).not.toBeNull();
    expect(entry?.entryIndex).toBeNull();
    expect(entry?.isTamperTest).toBe(true);
    expect(entry?.respData).toBeTruthy();
  });

  it('is case-insensitive on the hash', async () => {
    const entry = await mockDataSource.getEntry(GREEN_TX.toUpperCase().replace('0X', '0x'));
    expect(entry?.txHash).toBe(GREEN_TX);
  });

  it('returns null for an unknown hash', async () => {
    const entry = await mockDataSource.getEntry(`0x${'1'.repeat(64)}`);
    expect(entry).toBeNull();
  });
});

describe('getEntries / getEntriesPage are accepted-only', () => {
  it('never yields a rejected entry', async () => {
    const page = await mockDataSource.getEntriesPage('2', { limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((e) => e.status === 'accepted')).toBe(true);
    expect(page.total).toBe(getEntriesFor('2').length);
  });

  it('paginates without gaps or overlap', async () => {
    const first = await mockDataSource.getEntriesPage('2', { limit: 50 });
    expect(first.nextCursor).toBe(50);
    const second = await mockDataSource.getEntriesPage('2', { limit: 50, cursor: 50 });
    expect(second.items[0]?.entryIndex).toBe(50);
  });
});

describe('verifyTx outcomes (v1.1 [12])', () => {
  it('reports valid for an accepted entry', async () => {
    const r = await mockDataSource.verifyTx(GREEN_TX);
    expect(r.outcome).toBe('valid');
    expect(r.error).toBeUndefined();
    expect(r.checks.every((c) => c.pass)).toBe(true);
  });

  it('reports tampered — not "invalid" — for the BadCommit tamper test', async () => {
    const r = await mockDataSource.verifyTx(RED_TX);
    expect(r.outcome).toBe('tampered');
    expect(r.checks.some((c) => !c.pass)).toBe(true);
  });

  it('reports not_found in snake_case for a well-formed unknown hash', async () => {
    const r = await mockDataSource.verifyTx(`0x${'1'.repeat(64)}`);
    expect(r.outcome).toBe('not_found');
  });

  it('reports error with a message for a malformed hash', async () => {
    const r = await mockDataSource.verifyTx('not-a-hash');
    expect(r.outcome).toBe('error');
    // v1.1: populated iff outcome === 'error', so the UI need not mine the checks.
    expect(r.error).toBeTruthy();
  });

  it('no longer carries the removed `ok` field', async () => {
    const r = await mockDataSource.verifyTx(GREEN_TX);
    expect(r).not.toHaveProperty('ok');
  });

  it('surfaces a distinct failing check for every tamper reason', async () => {
    for (const test of getTamperTests()) {
      const r = await mockDataSource.verifyTx(test.txHash);
      expect(r.outcome, `${test.rejectReason}`).toBe('tampered');
      const failed = r.checks.filter((c) => !c.pass);
      expect(failed, `${test.rejectReason} should fail exactly one check`).toHaveLength(1);
    }
  });
});

describe('rent() derives both terms (v1.1 Q3)', () => {
  const listing = () => {
    const found = getListings().find((l) => l.tokenId === '1');
    if (!found) throw new Error('fixture listing 1 missing');
    return found;
  };

  it('derives maxDecisions as floor(escrow / feePerDecisionWei)', async () => {
    const { feePerDecisionWei } = listing();
    // 2.5x the fee must floor to 2 decisions, not round to 3.
    const escrow = (BigInt(feePerDecisionWei) * 5n) / 2n;
    const grant = await mockDataSource.rent('1', escrow.toString());
    expect(grant.maxDecisions).toBe(2);
    expect(grant.remainingEscrowWei).toBe(escrow.toString());
    expect(grant.decisionsUsed).toBe(0);
    expect(grant.status).toBe('active');
  });

  it('scales exactly with the escrow posted', async () => {
    const { feePerDecisionWei } = listing();
    const grant = await mockDataSource.rent('1', (BigInt(feePerDecisionWei) * 37n).toString());
    expect(grant.maxDecisions).toBe(37);
  });

  it('derives expiry as now + termSeconds', async () => {
    const { termSeconds, minEscrowWei } = listing();
    const before = Date.now();
    const grant = await mockDataSource.rent('1', minEscrowWei);
    const expiry = Date.parse(grant.expiry);

    // Bounded rather than exact: rent() reads the clock itself, which is correct
    // (the real expiry is set by block.timestamp, not by render time).
    expect(expiry).toBeGreaterThanOrEqual(before + termSeconds * 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + termSeconds * 1000);
  });
});

describe('settle() envelope', () => {
  it('rejects an empty selection rather than reporting a no-op success', async () => {
    const r = await mockDataSource.settle('1', []);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('accepts a partial selection (D17)', async () => {
    const r = await mockDataSource.settle('1', [1901, 1903]);
    expect(r.ok).toBe(true);
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('getSettlements', () => {
  it('only covers accepted entries attributed to a renter, with a 200 bps cut', async () => {
    const rows = await mockDataSource.getSettlements('1');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const fee = BigInt(row.feeWei);
      const protocol = BigInt(row.protocolFeeWei);
      expect(protocol).toBe((fee * 200n) / 10_000n);
      expect(BigInt(row.netToOwnerWei)).toBe(fee - protocol);
      expect(row.renter).not.toBe('0x0000000000000000000000000000000000000000');
    }
  });
});
