/**
 * The slot decision loop (PRD v2 §12).
 *
 * One slot, start to finish: snapshot, canonical request, inference, receipt,
 * local verification, sealed commit before the deadline, renter delivery, and
 * a reveal once the disclosure window opens.
 *
 * The rule that governs every failure path: if a slot cannot be committed
 * before its deadline, it is MISSED and that is correct behaviour, not a bug.
 * v2 never backfills. A missed slot is honest; a late one would be a lie.
 */

import {randomBytes} from 'node:crypto';

import {buildCommitLine, buildReceiptCommit, commitMatchesAt, findCommitOffset, buildExpectedCommit, ZERO_ADDRESS} from '@fief/reference';
import type {Address, Hex} from '@fief/reference';
import type {Hex as ViemHex} from 'viem';

import type {BookClient} from './book.js';
import type {ComputeClient} from './compute.js';
import {fetchSnapshot, inputHashOf, snapshotJson, type StrategyContainer} from './strategy.js';

export interface SlotContext {
  agentId: bigint;
  epochId: bigint;
  slot: number;
  strategyHash: Hex;
  renter: Address;
  book: BookClient;
  compute: ComputeClient;
  strategy: StrategyContainer;
}

/** What the renter receives at commit time, and what anyone can reveal with later. */
export interface RenterMessage {
  slot: number;
  decision: string | null;
  respData: string;
  signature: Hex;
  commitOffset: number;
  inputHash: Hex;
  renter: Address;
  salt: Hex;
  commitTx: string;
}

export type SlotOutcome =
  | {kind: 'committed'; message: RenterMessage; commitTx: string}
  | {kind: 'missed'; reason: string};

/**
 * Produce and commit one slot.
 *
 * Every step is inside the deadline budget. A failure anywhere returns `missed`
 * rather than throwing, because the caller's job is to keep the schedule
 * running and let the completeness counter absorb the loss.
 */
export async function runSlot(ctx: SlotContext): Promise<SlotOutcome> {
  const {book, compute} = ctx;

  try {
    const times = await book.slotTimes(ctx.agentId, ctx.epochId, ctx.slot);

    const snapshot = await fetchSnapshot('BTC-USDT', Number(times.snapshotAt));
    const inputHash = inputHashOf(snapshot);

    const commitLine = buildCommitLine({
      book: book.deployment.recordBook as Address,
      chainId: book.deployment.network.chainId,
      agentId: ctx.agentId.toString(),
      epochId: Number(ctx.epochId),
      slot: ctx.slot,
      strategyHash: ctx.strategyHash,
      inputHash,
      renter: ctx.renter,
    });

    // Cross-check the reference model against the deployed contract BEFORE
    // spending gas. If the two ever disagree by a byte, this is where it
    // surfaces as a readable diff rather than as an opaque BadCommit revert.
    const expOnChain = await book.expectedCommitBytes({
      agentId: ctx.agentId,
      epochId: ctx.epochId,
      slot: ctx.slot,
      strategyHash: ctx.strategyHash as ViemHex,
      inputHash: inputHash as ViemHex,
      renter: ctx.renter as ViemHex,
    });
    const expLocal = buildExpectedCommit({
      book: book.deployment.recordBook as Address,
      chainId: book.deployment.network.chainId,
      agentId: ctx.agentId.toString(),
      epochId: Number(ctx.epochId),
      slot: ctx.slot,
      strategyHash: ctx.strategyHash,
      inputHash,
      renter: ctx.renter,
    });
    const expOnChainUtf8 = Buffer.from(expOnChain.slice(2), 'hex').toString('utf8');
    if (expOnChainUtf8 !== expLocal) {
      return {
        kind: 'missed',
        reason: `EXP drift between reference and chain:\n  chain: ${expOnChainUtf8}\n  local: ${expLocal}`,
      };
    }

    const receipt = await compute.infer({
      commitLine,
      strategyPrompt: ctx.strategy.systemPrompt,
      snapshotJson: snapshotJson(snapshot),
    });

    // The model must have echoed the commit line at the head of its content.
    const commitOffset = findCommitOffset(receipt.respData, expLocal);
    if (commitOffset < 0 || !commitMatchesAt(receipt.respData, expLocal, commitOffset)) {
      return {
        kind: 'missed',
        reason: `model did not echo the commit line verbatim; content=${JSON.stringify(receipt.content?.slice(0, 120))}`,
      };
    }

    const salt = `0x${randomBytes(32).toString('hex')}` as Hex;
    const receiptCommit = buildReceiptCommit({
      respData: receipt.respData,
      signature: receipt.signature,
      commitOffset,
      inputHash,
      renter: ctx.renter,
      salt,
    });

    const nowChain = await book.now();
    if (nowChain > times.commitDeadline) {
      return {
        kind: 'missed',
        reason: `deadline passed before submit (now ${nowChain}, deadline ${times.commitDeadline})`,
      };
    }

    const commitTx = await book.commitDecision({
      agentId: ctx.agentId,
      epochId: ctx.epochId,
      slot: ctx.slot,
      reqSha: receipt.reqSha as ViemHex,
      respSha: receipt.respSha as ViemHex,
      receiptCommit: receiptCommit as ViemHex,
      provider: compute.provider as ViemHex,
    });

    return {
      kind: 'committed',
      commitTx,
      message: {
        slot: ctx.slot,
        decision: extractDecision(receipt.content),
        respData: receipt.respData,
        signature: receipt.signature,
        commitOffset,
        inputHash,
        renter: ctx.renter,
        salt,
        commitTx,
      },
    };
  } catch (err) {
    return {kind: 'missed', reason: err instanceof Error ? err.message : String(err)};
  }
}

/** Open a previously committed slot. Permissionless: anyone holding the payload can call it. */
export async function revealSlot(
  book: BookClient,
  agentId: bigint,
  epochId: bigint,
  m: RenterMessage,
): Promise<string> {
  return book.revealDecision({
    agentId,
    epochId,
    slot: m.slot,
    respData: `0x${Buffer.from(m.respData, 'utf8').toString('hex')}` as ViemHex,
    signature: m.signature as ViemHex,
    commitOffset: m.commitOffset,
    inputHash: m.inputHash as ViemHex,
    renter: m.renter as ViemHex,
    salt: m.salt as ViemHex,
  });
}

/** Line two of the model's reply is the decision JSON. */
function extractDecision(content: string | null): string | null {
  if (content === null) return null;
  const line = content.split('\n')[1];
  return line?.trim() ?? null;
}

export {ZERO_ADDRESS};
