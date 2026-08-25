/**
 * Forward epochs and slot resolution (PRD v2 §5 EpochBook, §6, §7 I11-I13).
 *
 * This module is the one that makes the v2 claim different from v1. v1 could
 * only say "each published entry is authentic". v2 says "and nothing was
 * dropped", and the reason it can is here: the schedule is derived purely from
 * a spec that was fixed before any outcome was knowable, and slot resolution is
 * a total function. Every scheduled slot maps to exactly one terminal state,
 * so a decision the owner chose not to publish shows up as `missed` forever.
 */

import type {
  CommitRecord,
  EntryRecord,
  EpochSpec,
  EpochSummary,
  SlotState,
  TerminalSlotState,
} from './types.js';
import { RejectError } from './types.js';

/**
 * Validate a spec at open time.
 *
 * The `startTime >= now` rule is invariant I11 and is not a sanity check: it is
 * the entire reason the record is prospective. An epoch opened over a window
 * whose outcomes are already known would let an operator "commit" to the past.
 */
export function validateEpochSpec(spec: EpochSpec, now: number): void {
  if (spec.startTime < now) throw new RejectError('EpochNotOpen');
  if (spec.slotCount <= 0) throw new RejectError('UnknownSlot');
  if (spec.cadenceSeconds <= 0) throw new RejectError('UnknownSlot');
  if (spec.maxCommitDelay <= 0) throw new RejectError('UnknownSlot');
  if (spec.providerSet.length === 0) throw new RejectError('ProviderNotPinned');
  // A commit deadline at or past the next snapshot would let two slots be in
  // flight at once, which breaks the one-decision-per-slot reading of the record.
  if (spec.maxCommitDelay >= spec.cadenceSeconds) throw new RejectError('SlotDeadlinePassed');
}

export const slotSnapshotTime = (spec: EpochSpec, slot: number): number =>
  spec.startTime + slot * spec.cadenceSeconds;

export const slotCommitDeadline = (spec: EpochSpec, slot: number): number =>
  slotSnapshotTime(spec, slot) + spec.maxCommitDelay;

export const slotRevealOpen = (spec: EpochSpec, slot: number): number =>
  slotSnapshotTime(spec, slot) + spec.horizonSeconds + spec.disclosureDelay;

export const epochEnd = (spec: EpochSpec): number =>
  slotCommitDeadline(spec, spec.slotCount - 1);

/** Every scheduled slot index, in order. */
export function slotSchedule(spec: EpochSpec): number[] {
  return Array.from({ length: spec.slotCount }, (_, i) => i);
}

/**
 * Grace after a slot's reveal window opens, before an unopened commitment is
 * counted invalid. Mirrors `EpochBook.REVEAL_GRACE`.
 */
export const REVEAL_GRACE_SECONDS = 86_400;

export interface EpochState {
  spec: EpochSpec;
  commits: Map<number, CommitRecord>;
  entries: Map<number, EntryRecord>;
  abandonedAt: number | null;
}

export function openEpoch(spec: EpochSpec, now: number): EpochState {
  validateEpochSpec(spec, now);
  return {
    spec,
    commits: new Map(),
    entries: new Map(),
    abandonedAt: null,
  };
}

/**
 * Resolve a single slot at time `now`.
 *
 * Total by construction: every branch returns, and the five states are
 * mutually exclusive. `missed` is derived rather than stored, which is what
 * keeps a 144-slot day at O(1) on-chain storage while still accounting for
 * every slot.
 */
export function resolveSlot(state: EpochState, slot: number, now: number): SlotState {
  if (slot < 0 || slot >= state.spec.slotCount) throw new RejectError('UnknownSlot');

  if (state.entries.has(slot)) return 'revealed';

  if (state.commits.has(slot)) {
    // Committed but never opened, past its window: nobody could produce a
    // payload matching the published commitment.
    const deadline = slotRevealOpen(state.spec, slot) + REVEAL_GRACE_SECONDS;
    return now > deadline ? 'invalid' : 'committed';
  }

  // An abandoned epoch resolves its remaining slots immediately rather than
  // leaving them 'scheduled' forever.
  if (state.abandonedAt !== null) return 'missed';

  return now > slotCommitDeadline(state.spec, slot) ? 'missed' : 'scheduled';
}

export function abandonEpoch(state: EpochState, now: number): void {
  state.abandonedAt = now;
}

/**
 * Summarise an epoch. After `epochEnd` (or abandonment) this is the immutable
 * record of what the agent actually did.
 *
 * Invariant I13 is asserted here rather than merely documented, because a
 * summary that silently lost a slot is exactly the failure the whole design
 * exists to prevent.
 */
export function epochSummary(state: EpochState, now: number): EpochSummary {
  let committed = 0;
  let revealed = 0;
  let missed = 0;
  let invalid = 0;
  let scheduled = 0;

  for (const slot of slotSchedule(state.spec)) {
    switch (resolveSlot(state, slot, now)) {
      case 'revealed':
        revealed += 1;
        committed += 1;
        break;
      case 'invalid':
        invalid += 1;
        committed += 1;
        break;
      case 'committed':
        committed += 1;
        break;
      case 'missed':
        missed += 1;
        break;
      case 'scheduled':
        scheduled += 1;
        break;
    }
  }

  const { slotCount } = state.spec;
  if (committed + missed + scheduled !== slotCount) {
    throw new Error(
      `I13 violated: committed(${committed}) + missed(${missed}) + scheduled(${scheduled}) != slotCount(${slotCount})`,
    );
  }

  return {
    slotCount,
    committed,
    revealed,
    missed,
    invalid,
    completeness: slotCount === 0 ? 0 : revealed / slotCount,
  };
}

/** Terminal summary once the epoch can no longer change. */
export function finalizeEpoch(state: EpochState, now: number): EpochSummary {
  const end = state.abandonedAt ?? epochEnd(state.spec);
  if (now <= end) throw new RejectError('SlotDeadlinePassed');

  const summary = epochSummary(state, now);
  // At finalization there is no 'scheduled' left, so I13 tightens to the exact
  // form stated in the PRD.
  if (summary.committed + summary.missed !== summary.slotCount) {
    throw new Error('I13 violated at finalize: committed + missed != slotCount');
  }
  return summary;
}

/** The terminal state of each slot in a finalized epoch. */
export function terminalStates(state: EpochState, now: number): Map<number, TerminalSlotState> {
  const out = new Map<number, TerminalSlotState>();
  for (const slot of slotSchedule(state.spec)) {
    const s = resolveSlot(state, slot, now);
    // A committed-but-unrevealed slot past its window is reported as invalid:
    // it never became a proven decision, and counting it as anything else would
    // let an operator bank credit for a signal nobody can check.
    out.set(slot, s === 'revealed' ? 'revealed' : s === 'invalid' ? 'invalid' : s === 'committed' ? 'invalid' : 'missed');
  }
  return out;
}
