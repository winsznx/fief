/**
 * The commit/reveal decision lifecycle (PRD v2 §4.3, §5 RecordBook).
 *
 * Two phases, and the split is the product, not an implementation detail:
 * commit publishes a sealed, timely, direction-free commitment; reveal opens it
 * after the market horizon and runs the byte-exact verification. Renters get
 * the cleartext at commit time, which is what they are paying for.
 */

import { buildExpectedCommit, commitMatchesAt } from './commit.js';
import { buildReceiptCommit, sha256Hex, signedText, recoverSigner, keccak256Hex } from './receipt.js';
import type { EpochState } from './epoch.js';
import { slotCommitDeadline, slotRevealOpen } from './epoch.js';
import type {
  Address,
  CommitRecord,
  EntryRecord,
  Hex,
  RejectReason,
  RevealPayload,
} from './types.js';
import { RejectError } from './types.js';

export interface BookContext {
  book: Address;
  chainId: number;
  agentId: string;
  epochId: number;
  operator: Address;
  /** Resolves the registered TEE signer, mirroring the on-chain getService staticcall. */
  teeSignerOf: (provider: Address) => { signer: Address; acknowledged: boolean } | null;
}

export interface CommitArgs {
  slot: number;
  reqSha: Hex;
  respSha: Hex;
  receiptCommit: Hex;
  provider: Address;
  sender: Address;
  now: number;
}

/**
 * Publish a sealed commitment for a slot.
 *
 * The deadline check is invariant I12. It is the single line that makes late
 * commits impossible, and therefore the line that stops an operator from
 * waiting to see the outcome before deciding whether to record a call.
 */
export function applyCommit(
  state: EpochState,
  ctx: BookContext,
  args: CommitArgs,
): CommitRecord {
  if (args.sender.toLowerCase() !== ctx.operator.toLowerCase()) {
    throw new RejectError('NotOperator');
  }
  if (state.abandonedAt !== null) throw new RejectError('EpochNotOpen');
  if (args.slot < 0 || args.slot >= state.spec.slotCount) throw new RejectError('UnknownSlot');
  if (state.commits.has(args.slot)) throw new RejectError('SlotAlreadyCommitted');
  if (args.now > slotCommitDeadline(state.spec, args.slot)) {
    throw new RejectError('SlotDeadlinePassed');
  }
  const pinned = state.spec.providerSet.some(
    (p) => p.toLowerCase() === args.provider.toLowerCase(),
  );
  if (!pinned) throw new RejectError('ProviderNotPinned');

  const record: CommitRecord = {
    reqSha: args.reqSha,
    respSha: args.respSha,
    receiptCommit: args.receiptCommit,
    provider: args.provider,
    committedAt: args.now,
  };
  state.commits.set(args.slot, record);
  return record;
}

export interface RevealArgs extends RevealPayload {
  slot: number;
  now: number;
}

/**
 * Open a commitment and verify it byte-exact.
 *
 * Permissionless on purpose (PRD v2 §9, "selective reveal"): the renter already
 * holds the plaintext, so an owner who sits on a losing call cannot bury it.
 * Because it is permissionless, a failed reveal must leave the slot untouched
 * and retryable; see `fail` below.
 */
export function applyReveal(
  state: EpochState,
  ctx: BookContext,
  args: RevealArgs,
): EntryRecord {
  const commit = state.commits.get(args.slot);
  if (commit === undefined) throw new RejectError('NoCommit');
  if (state.entries.has(args.slot)) throw new RejectError('AlreadyRevealed');
  if (args.now < slotRevealOpen(state.spec, args.slot)) throw new RejectError('RevealTooEarly');

  // A failed reveal changes NOTHING. Reveal is permissionless, so burning the
  // slot on failure would let anyone destroy an honest agent's completeness by
  // spamming garbage reveals. A slot that is committed but never successfully
  // revealed is derived as invalid once its reveal window plus grace has
  // elapsed (see `resolveSlot`).
  //
  // Annotated on the binding, not just the arrow: TypeScript only narrows
  // control flow through a never-returning call when the variable itself is
  // explicitly typed.
  const fail: (reason: RejectReason) => never = (reason) => {
    throw new RejectError(reason);
  };

  // 1. the reveal must open exactly the commitment that was published (I14)
  const recomputed = buildReceiptCommit({
    respData: args.respData,
    signature: args.signature,
    commitOffset: args.commitOffset,
    inputHash: args.inputHash,
    renter: args.renter,
    salt: args.salt,
  });
  if (recomputed.toLowerCase() !== commit.receiptCommit.toLowerCase()) fail('BadReveal');

  // 2. the response bytes must hash to what was committed
  const respSha = sha256Hex(args.respData);
  if (respSha.toLowerCase() !== commit.respSha.toLowerCase()) fail('BadHash');

  // 3. recover over the recomputed 129-byte text, never over a provider-supplied one
  const text = signedText(commit.reqSha, respSha);
  let recovered: Address;
  try {
    recovered = recoverSigner(text, args.signature);
  } catch {
    return fail('BadSigner');
  }

  const registered = ctx.teeSignerOf(commit.provider);
  if (registered === null || !registered.acknowledged) fail('BadSigner');
  if (recovered.toLowerCase() !== registered.signer.toLowerCase()) fail('BadSigner');

  // 4. the signed response must contain the commitment this contract expects
  const exp = buildExpectedCommit({
    book: ctx.book,
    chainId: ctx.chainId,
    agentId: ctx.agentId,
    epochId: ctx.epochId,
    slot: args.slot,
    strategyHash: state.spec.strategyHash,
    inputHash: args.inputHash,
    renter: args.renter,
  });
  if (!commitMatchesAt(args.respData, exp, args.commitOffset)) fail('BadCommit');

  const entry: EntryRecord = {
    slot: args.slot,
    epochId: ctx.epochId,
    reqSha: commit.reqSha,
    respSha,
    provider: commit.provider,
    teeSigner: recovered,
    inputHash: args.inputHash,
    renter: args.renter,
    decisionDigest: keccak256Hex(args.respData),
    revealedAt: args.now,
  };
  state.entries.set(args.slot, entry);
  return entry;
}
