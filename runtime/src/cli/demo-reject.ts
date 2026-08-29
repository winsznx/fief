/**
 * An instant, filmable, on-mainnet rejection: a record entry cannot be rewritten.
 *
 * What this proves, precisely: take a slot that is already on the record, alter
 * its response, and try to write it again. The chain refuses, and the agent's
 * completeness is byte-for-byte unchanged afterwards. Runs in about eight
 * seconds against live mainnet.
 *
 * What it does NOT prove, and where to get that instead: the rejection reason
 * here is `AlreadyRevealed`, because the contract checks that a slot is
 * unrevealed before it checks the payload. The tamper case, `BadReveal`, needs
 * a slot that is committed but still inside its disclosure window, and the
 * plaintext for such a slot exists only with the operator — that is the whole
 * point of the private phase. The canonical `BadReveal` is already on mainnet
 * as `0x6d68ade363d72e788f01120684de7dd179624d7e5ff5258335b0741cb055a06b`, a
 * successful transaction carrying the rejection as an event.
 *
 * `pnpm adversarial` covers both, but spends ~5 minutes waiting on real slot
 * deadlines, which is unwatchable on camera. This is the fast complement, not
 * a replacement.
 *
 * Safe to run against the running campaign, and that safety is the second
 * thing it demonstrates: a failed reveal changes no state, so an attacker
 * cannot use one to damage an honest agent's record.
 *
 *   NETWORK=mainnet AGENT=7 pnpm demo-reject
 */

import {randomBytes} from 'node:crypto';

import {ZERO_ADDRESS} from '@fief/reference';
import type {Hex} from '@fief/reference';
import {decodeFunctionData, parseAbiItem} from 'viem';
import type {Hex as ViemHex} from 'viem';

import {BookClient} from '../book.js';
import {activeDeployment, requireEnv} from '../config.js';

const log = (...a: unknown[]) => console.log(...a);
const AGENT = BigInt(process.env.AGENT ?? '7');
const EPOCH = BigInt(process.env.EPOCH ?? '0');

const revealAbi = parseAbiItem(
  'function revealDecision((uint256 agentId,uint64 epochId,uint32 slot,bytes respData,bytes signature,uint32 commitOffset,bytes32 inputHash,address renter,bytes32 salt))',
);

async function main(): Promise<void> {
  const pk = requireEnv('PRIVATE_KEY');
  const book = new BookClient(activeDeployment(), pk);

  log(`agent ${AGENT}, epoch ${EPOCH} on chain ${book.deployment.network.chainId}`);
  const before = await book.completenessBps(AGENT, EPOCH);
  const metaBefore = await book.epochMeta(AGENT, EPOCH);
  log(`completeness before : ${before / 100}%  (${metaBefore.revealedCount} revealed)`);

  // Find a slot that has already been revealed, and reuse its own payload.
  // Taking real bytes off the chain means the only thing wrong with the
  // submission is the byte this script flips.
  log('\nfinding a revealed slot to attack…');
  let target = -1;
  let payload: {respData: string; signature: Hex; commitOffset: number; inputHash: Hex} | null = null;

  for (let slot = Number(metaBefore.revealedCount) - 1; slot >= 0 && target < 0; slot -= 1) {
    if (!(await book.isRevealed(AGENT, EPOCH, slot))) continue;
    const entry = await book.entryRevealTx(AGENT, EPOCH, slot);
    if (entry === null) continue;
    try {
      const tx = await book.getTransaction(entry);
      const {args} = decodeFunctionData({abi: [revealAbi], data: tx.input});
      const a = (args as readonly unknown[])[0] as {
        respData: ViemHex;
        signature: ViemHex;
        commitOffset: number;
        inputHash: ViemHex;
      };
      payload = {
        respData: Buffer.from(a.respData.slice(2), 'hex').toString('utf8'),
        signature: a.signature as Hex,
        commitOffset: a.commitOffset,
        inputHash: a.inputHash as Hex,
      };
      target = slot;
    } catch {
      // keep looking
    }
  }

  if (target < 0 || payload === null) {
    throw new Error('no revealed slot with recoverable calldata found; try a different AGENT');
  }
  log(`   slot ${target}, ${payload.respData.length} bytes of signed response`);

  // Flip exactly one character.
  const bytes = Buffer.from(payload.respData, 'utf8');
  const at = bytes.length - 3;
  const was = String.fromCharCode(bytes[at] as number);
  bytes[at] = bytes[at] === 0x30 ? 0x31 : 0x30;
  log(`   flipped byte ${at}: '${was}' -> '${String.fromCharCode(bytes[at] as number)}'`);

  log('\nsubmitting the altered entry to mainnet…');
  try {
    await book.revealDecision({
      agentId: AGENT,
      epochId: EPOCH,
      slot: target,
      respData: `0x${bytes.toString('hex')}` as ViemHex,
      signature: payload.signature as ViemHex,
      commitOffset: payload.commitOffset,
      inputHash: payload.inputHash as ViemHex,
      renter: ZERO_ADDRESS as ViemHex,
      salt: `0x${randomBytes(32).toString('hex')}` as ViemHex,
    });
    log('   FAIL — the chain ACCEPTED a rewritten entry. This must never happen.');
    process.exit(1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason =
      ['AlreadyRevealed', 'BadReveal', 'BadHash', 'BadCommit', 'BadSigner'].find((r) =>
        msg.includes(r),
      ) ?? 'rejected';
    log(`   REJECTED: ${reason}`);
  }

  const after = await book.completenessBps(AGENT, EPOCH);
  const metaAfter = await book.epochMeta(AGENT, EPOCH);
  log(`\ncompleteness after  : ${after / 100}%  (${metaAfter.revealedCount} revealed)`);
  log(
    before === after && metaBefore.revealedCount === metaAfter.revealedCount
      ? '   unchanged — a rejected reveal cannot damage the record'
      : '   CHANGED — this would be a griefing vector',
  );
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
