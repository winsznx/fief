/**
 * Rental escrow and settlement (PRD v2 §5 RentalDesk, §7 I5 / I15).
 *
 * Two properties carry the weight here. Conservation (I5) is checked on every
 * mutation rather than only in tests, because an escrow bug is a fund bug. And
 * grants are bound to the epoch they were bought against (I15), so a renter who
 * paid for one brain never silently keeps paying for a different one.
 */

import type { EntryRecord, Grant, Listing } from './types.js';
import { RejectError } from './types.js';

export const PROTOCOL_FEE_BPS = 200n;
const BPS_DENOMINATOR = 10_000n;

/** escrowed == settled + refunded + remaining, always (I5). */
export function assertConservation(g: Grant): void {
  const sum = g.settledWei + g.refundedWei + g.remainingWei;
  if (sum !== g.escrowedWei) {
    throw new Error(
      `I5 violated: settled(${g.settledWei}) + refunded(${g.refundedWei}) + remaining(${g.remainingWei}) != escrowed(${g.escrowedWei})`,
    );
  }
}

export function rent(args: {
  listing: Listing;
  renter: `0x${string}`;
  epochId: number;
  valueWei: bigint;
  now: number;
}): Grant {
  if (!args.listing.active) throw new RejectError('EpochNotOpen');
  if (args.valueWei < args.listing.minEscrowWei) throw new RejectError('BadReveal');
  if (args.listing.feePerDecisionWei <= 0n) throw new RejectError('BadReveal');

  const grant: Grant = {
    renter: args.renter,
    epochId: args.epochId,
    expiry: args.now + args.listing.termSeconds,
    // Integer division on purpose: the renter can only consume whole decisions,
    // and the dust remains theirs to reclaim at expiry.
    maxDecisions: Number(args.valueWei / args.listing.feePerDecisionWei),
    escrowedWei: args.valueWei,
    remainingWei: args.valueWei,
    settledWei: 0n,
    refundedWei: 0n,
    paused: false,
  };
  assertConservation(grant);
  return grant;
}

export interface SettleResult {
  settledSlots: number[];
  ownerWei: bigint;
  protocolWei: bigint;
}

/**
 * Settle revealed entries against a grant.
 *
 * Settlement is on reveal, never on commit, so a renter only ever pays for a
 * signal that has been proven on-chain. A committed-but-unrevealed slot is
 * free to them.
 */
export function settle(args: {
  grant: Grant;
  listing: Listing;
  entries: EntryRecord[];
  now: number;
}): SettleResult {
  const g = args.grant;
  if (g.paused) throw new RejectError('EpochNotOpen');

  const fee = args.listing.feePerDecisionWei;
  const settledSlots: number[] = [];
  let gross = 0n;

  const seen = new Set<number>();
  for (const e of args.entries) {
    if (g.remainingWei < fee) break;
    if (settledSlots.length >= g.maxDecisions) break;
    // I15: a grant settles only against the epoch it was bought for.
    if (e.epochId !== g.epochId) continue;
    if (e.renter.toLowerCase() !== g.renter.toLowerCase()) continue;
    if (seen.has(e.slot)) continue;
    seen.add(e.slot);

    g.remainingWei -= fee;
    g.settledWei += fee;
    gross += fee;
    settledSlots.push(e.slot);
  }

  const protocolWei = (gross * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
  assertConservation(g);
  return { settledSlots, ownerWei: gross - protocolWei, protocolWei };
}

/** Refund the unspent remainder once the term is over or the grant is revoked. */
export function refund(grant: Grant, now: number, force = false): bigint {
  if (!force && now < grant.expiry) throw new RejectError('RevealTooEarly');
  const amount = grant.remainingWei;
  grant.remainingWei = 0n;
  grant.refundedWei += amount;
  assertConservation(grant);
  return amount;
}

/**
 * Advance the agent to a new epoch.
 *
 * Grants do not follow. Pausing rather than auto-migrating is the whole point
 * of I15: a new epoch is a different brain, and consent to rent one is not
 * consent to rent the next.
 */
export function reseal(grants: Grant[]): Grant[] {
  for (const g of grants) g.paused = true;
  return grants;
}

/** The renter accepts the new epoch and the grant resumes against it. */
export function consentToEpoch(grant: Grant, epochId: number): Grant {
  grant.epochId = epochId;
  grant.paused = false;
  return grant;
}
