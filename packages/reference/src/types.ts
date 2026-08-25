/**
 * Shared types for the Fief reference model (PRD v2 §11).
 *
 * These mirror the Solidity structs in PRD v2 §5. Where a Solidity value is a
 * uint256 that can exceed 2^53, it is a bigint here; small bounded values
 * (slot index, cadence, counts) stay number so the arithmetic reads normally.
 */

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export type Direction = 'UP' | 'DOWN' | 'FLAT';

/** conf and size are both in 0..1. */
export interface Decision {
  dir: Direction;
  conf: number;
  size: number;
}

/**
 * Terminal state of a scheduled slot (PRD v2 §6).
 *
 * Every scheduled slot resolves to exactly one of these. There is no fourth
 * state and no way for a slot to disappear: that totality is invariant I13 and
 * it is what closes the selective-omission attack that v1 was open to.
 */
export type SlotState =
  | 'scheduled' // deadline not yet passed, no commit
  | 'committed' // committed in time, reveal window not closed
  | 'revealed' // committed and successfully revealed
  | 'missed' // no commit by the deadline (derived, never stored)
  | 'invalid'; // committed but the reveal failed verification

/** A slot state that a finalized epoch can hold. */
export type TerminalSlotState = Extract<SlotState, 'revealed' | 'missed' | 'invalid'>;

export type RejectReason =
  | 'NotOperator'
  | 'SlotDeadlinePassed'
  | 'SlotAlreadyCommitted'
  | 'UnknownSlot'
  | 'ProviderNotPinned'
  | 'RevealTooEarly'
  | 'NoCommit'
  | 'AlreadyRevealed'
  | 'BadReveal'
  | 'BadHash'
  | 'BadSigner'
  | 'BadCommit'
  | 'EpochNotOpen';

/**
 * Forward epoch spec (PRD v2 §5 EpochBook).
 *
 * Fixed on-chain before any slot snapshot time. Immutable once opened. This is
 * the object whose existence-before-the-fact makes the record prospective.
 */
export interface EpochSpec {
  market: string; // e.g. "BTC-USDT"
  cadenceSeconds: number; // slot spacing
  horizonSeconds: number; // evaluation horizon per slot
  maxCommitDelay: number; // commit deadline offset from snapshot time
  disclosureDelay: number; // reveal opens at snap + horizon + this
  startTime: number; // unix seconds of the first slot snapshot
  slotCount: number; // total scheduled slots
  strategyHash: Hex; // H for this epoch
  providerSet: Address[]; // pinned TeeML providers
}

export interface CommitLineParts {
  book: Address;
  chainId: number;
  agentId: string;
  epochId: number;
  slot: number;
  strategyHash: Hex;
  inputHash: Hex;
  renter: Address;
}

/** What the chain stores at commit time. Carries no information about direction. */
export interface CommitRecord {
  reqSha: Hex;
  respSha: Hex;
  receiptCommit: Hex;
  provider: Address;
  committedAt: number;
}

/** What the chain stores once a commit is successfully opened. */
export interface EntryRecord {
  slot: number;
  epochId: number;
  reqSha: Hex;
  respSha: Hex;
  provider: Address;
  teeSigner: Address;
  inputHash: Hex;
  renter: Address;
  decisionDigest: Hex;
  revealedAt: number;
}

/** The plaintext a renter receives at commit time and anyone can later reveal. */
export interface RevealPayload {
  respData: string;
  signature: Hex;
  commitOffset: number;
  inputHash: Hex;
  renter: Address;
  salt: Hex;
}

export interface EpochSummary {
  slotCount: number;
  committed: number;
  revealed: number;
  missed: number;
  invalid: number;
  /** revealed / slotCount, in 0..1. */
  completeness: number;
}

export interface Grant {
  renter: Address;
  epochId: number;
  expiry: number;
  maxDecisions: number;
  escrowedWei: bigint;
  remainingWei: bigint;
  settledWei: bigint;
  refundedWei: bigint;
  /** Set when the owner advances the epoch and the renter has not re-consented. */
  paused: boolean;
}

export interface Listing {
  agentId: string;
  feePerDecisionWei: bigint;
  minEscrowWei: bigint;
  termSeconds: number;
  active: boolean;
}

export class RejectError extends Error {
  constructor(readonly reason: RejectReason) {
    super(reason);
    this.name = 'RejectError';
  }
}
