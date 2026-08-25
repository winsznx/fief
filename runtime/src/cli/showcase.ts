/**
 * Produce every canonical artifact for the Wave 3 submission, in one run.
 *
 * This is the script behind the README's first screen and the demo video, so it
 * does the whole story in order and prints the exact values the frontend env
 * and the docs need:
 *
 *   1. seal the strategy and upload the ciphertext to 0G Storage
 *   2. register the agent with (H, storageRoot) — the strategy commitment and
 *      the sealed blob's merkle root
 *   3. open a forward epoch whose schedule is fixed before any slot exists
 *   4. slot 0: real TEE-signed inference, sealed commit, then reveal -> GREEN
 *   5. slot 1: real commit, then a one-byte-tampered reveal through
 *      `revealDecisionStrict` -> RED, as a SUCCESSFUL transaction carrying a
 *      `DecisionRejected` event rather than a failed one
 *
 * Step 5 matters for legibility: a reverted transaction reads on an explorer
 * like the system broke, when what actually happened is the system worked.
 */

import {randomBytes} from 'node:crypto';

import {
  ZERO_ADDRESS,
  buildCommitLine,
  buildExpectedCommit,
  buildReceiptCommit,
  findCommitOffset,
} from '@fief/reference';
import type {Address, Hex} from '@fief/reference';
import type {Hex as ViemHex} from 'viem';
import {keccak256, encodeAbiParameters, toHex} from 'viem';

import {BookClient} from '../book.js';
import {ComputeClient} from '../compute.js';
import {PROVIDERS, activeDeployment, requireEnv} from '../config.js';
import {seal, upload} from '../storage.js';
import {
  canonicalStrategyJson,
  demoStrategy,
  fetchSnapshot,
  inputHashOf,
  snapshotJson,
  strategyHash,
} from '../strategy.js';

const CADENCE = Number(process.env.CADENCE ?? '150');
const MAX_COMMIT_DELAY = Number(process.env.MAX_COMMIT_DELAY ?? '120');
const HORIZON = Number(process.env.HORIZON ?? '20');
const DISCLOSURE_DELAY = Number(process.env.DISCLOSURE_DELAY ?? '10');
const LEAD = Number(process.env.LEAD ?? '25');

const log = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Prepared {
  respData: string;
  signature: Hex;
  commitOffset: number;
  inputHash: Hex;
  salt: Hex;
  receiptCommit: Hex;
  reqSha: Hex;
  respSha: Hex;
  decision: string | null;
}

async function main(): Promise<void> {
  const pk = requireEnv('PRIVATE_KEY');
  const net = process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  const provider = PROVIDERS.glm;

  const book = new BookClient(activeDeployment(), pk);
  const compute = await ComputeClient.connect(pk, provider.address as Address);
  const out: Record<string, string> = {};

  log(`network    ${net} (${book.deployment.network.chainId})`);
  log(`operator   ${book.account.address}`);
  log(`balance    ${Number(await book.balance()) / 1e18} OG\n`);

  /* --------------------------------------------------------------- 1 */

  log('[1] seal the strategy and upload to 0G Storage');
  const strategy = demoStrategy();
  const plaintext = canonicalStrategyJson(strategy);
  const H = strategyHash(strategy);
  const blob = seal(plaintext);
  const stored = await upload(blob.bytes, pk, net);

  log(`   H (strategy commitment) ${H}`);
  log(`   sealed blob             ${blob.bytes.length} bytes AES-256-GCM`);
  log(`   storage rootHash        ${stored.rootHash}`);
  log(
    stored.uploaded
      ? `   uploaded                ${stored.txHash}`
      : `   upload FAILED           ${(stored.note ?? '').slice(0, 140)}`,
  );
  // The key is printed once and never persisted. In production it is sealed to
  // the owner's pubkey and only re-sealed to an auditor under a logged grant.
  log(`   blob key (keep safe)    ${blob.keyHex}`);
  out.strategyHash = H;
  out.storageRoot = stored.rootHash;
  if (stored.txHash !== null) out.storageTx = stored.txHash;

  /* --------------------------------------------------------------- 2 */

  log('\n[2] register the agent');
  const {agentId, hash: regTx} = await book.register(
    H as ViemHex,
    stored.rootHash as ViemHex,
    'BTC short-horizon direction',
  );
  log(`   agentId ${agentId}   ${book.txUrl(regTx)}`);
  out.agentId = agentId.toString();
  out.registerTx = regTx;

  /* --------------------------------------------------------------- 3 */

  log('\n[3] open the forward epoch');
  const epochId = 0n;
  const startTime = (await book.now()) + BigInt(LEAD);
  const openTx = await book.openEpoch(
    agentId,
    epochId,
    {
      market: keccak256(toHex('BTC-USDT')),
      cadenceSeconds: CADENCE,
      horizonSeconds: HORIZON,
      maxCommitDelay: MAX_COMMIT_DELAY,
      disclosureDelay: DISCLOSURE_DELAY,
      startTime,
      slotCount: 2,
      strategyHash: H as ViemHex,
      providerSetHash: keccak256(
        encodeAbiParameters([{type: 'address'}], [provider.address as ViemHex]),
      ),
    },
    [provider.address as ViemHex],
  );
  log(`   schedule fixed at block time, startTime ${startTime}`);
  log(`   ${book.txUrl(openTx)}`);
  out.epochId = epochId.toString();
  out.openEpochTx = openTx;

  /* ------------------------------------------------------------ prep */

  const prepare = async (slot: number): Promise<Prepared> => {
    const t = await book.slotTimes(agentId, epochId, slot);
    const waitMs = Number(t.snapshotAt - (await book.now())) * 1000;
    if (waitMs > 0) {
      log(`   waiting ${Math.round(waitMs / 1000)}s for slot ${slot}'s snapshot time`);
      await sleep(waitMs);
    }

    const snapshot = await fetchSnapshot('BTC-USDT', Number(t.snapshotAt));
    const inputHash = inputHashOf(snapshot);
    const parts = {
      book: book.deployment.recordBook as Address,
      chainId: book.deployment.network.chainId,
      agentId: agentId.toString(),
      epochId: Number(epochId),
      slot,
      strategyHash: H,
      inputHash,
      renter: ZERO_ADDRESS as Address,
    };

    const receipt = await compute.infer({
      commitLine: buildCommitLine(parts),
      strategyPrompt: strategy.systemPrompt,
      snapshotJson: snapshotJson(snapshot),
    });
    const commitOffset = findCommitOffset(receipt.respData, buildExpectedCommit(parts));
    if (commitOffset < 0) throw new Error(`slot ${slot}: model did not echo the commit line`);

    const salt = `0x${randomBytes(32).toString('hex')}` as Hex;
    return {
      respData: receipt.respData,
      signature: receipt.signature,
      commitOffset,
      inputHash,
      salt,
      reqSha: receipt.reqSha,
      respSha: receipt.respSha,
      decision: receipt.content?.split('\n')[1]?.trim() ?? null,
      receiptCommit: buildReceiptCommit({
        respData: receipt.respData,
        signature: receipt.signature,
        commitOffset,
        inputHash,
        renter: ZERO_ADDRESS as Address,
        salt,
      }),
    };
  };

  const commit = async (slot: number, p: Prepared) =>
    book.commitDecision({
      agentId,
      epochId,
      slot,
      reqSha: p.reqSha as ViemHex,
      respSha: p.respSha as ViemHex,
      receiptCommit: p.receiptCommit as ViemHex,
      provider: provider.address as ViemHex,
    });

  const revealArgs = (slot: number, p: Prepared, respData?: Buffer) => ({
    agentId,
    epochId,
    slot,
    respData: `0x${(respData ?? Buffer.from(p.respData, 'utf8')).toString('hex')}` as ViemHex,
    signature: p.signature as ViemHex,
    commitOffset: p.commitOffset,
    inputHash: p.inputHash as ViemHex,
    renter: ZERO_ADDRESS as ViemHex,
    salt: p.salt as ViemHex,
  });

  const waitReveal = async (slot: number) => {
    const t = await book.slotTimes(agentId, epochId, slot);
    const ms = Number(t.revealOpen - (await book.now())) * 1000 + 3000;
    if (ms > 0) {
      log(`   waiting ${Math.round(ms / 1000)}s for slot ${slot}'s disclosure window`);
      await sleep(ms);
    }
  };

  /* --------------------------------------------------------------- 4 */

  log('\n[4] slot 0 — the GREEN pair');
  const p0 = await prepare(0);
  const commitTx = await commit(0, p0);
  log(`   COMMIT  sealed, direction private   ${book.txUrl(commitTx)}`);
  log(`           renter sees: ${p0.decision}`);
  out.greenCommitTx = commitTx;

  await waitReveal(0);
  const revealTx = await book.revealDecision(revealArgs(0, p0));
  log(`   REVEAL  verified byte-exact on-chain ${book.txUrl(revealTx)}`);
  out.greenRevealTx = revealTx;

  /* --------------------------------------------------------------- 5 */

  log('\n[5] slot 1 — the RED transaction');
  const p1 = await prepare(1);
  const commitTx1 = await commit(1, p1);
  log(`   COMMIT  ${book.txUrl(commitTx1)}`);

  await waitReveal(1);
  const tampered = Buffer.from(p1.respData, 'utf8');
  const at = tampered.length - 3;
  tampered[at] = tampered[at] === 0x30 ? 0x31 : 0x30;

  const redTx = await book.revealDecisionStrict(revealArgs(1, p1, tampered));
  log(`   REVEAL  one byte flipped at offset ${at} of ${tampered.length}`);
  log(`           REJECTED on-chain, as a successful tx carrying DecisionRejected`);
  log(`           ${book.txUrl(redTx)}`);
  out.redTx = redTx;

  const stillUnrevealed = !(await book.isRevealed(agentId, epochId, 1));
  log(`   slot 1 still unrevealed (not griefable): ${stillUnrevealed}`);

  // The rejection must not have cost the agent the slot. Revealing honestly
  // afterwards is the proof, and it takes the epoch to full completeness: the
  // tamper was caught AND the record is undamaged.
  const repairTx = await book.revealDecision(revealArgs(1, p1));
  log(`   honest reveal of the same slot still accepted`);
  log(`           ${book.txUrl(repairTx)}`);
  out.repairRevealTx = repairTx;

  /* --------------------------------------------------------------- 6 */

  log('\n[6] epoch state');
  const meta = await book.epochMeta(agentId, epochId);
  log(`   committed ${meta.committedCount} / 2   revealed ${meta.revealedCount}`);
  log(`   completeness ${(await book.completenessBps(agentId, epochId)) / 100}%`);

  log('\n--- frontend env ---');
  log(`NEXT_PUBLIC_NETWORK=${net}`);
  log(`NEXT_PUBLIC_RECORD_BOOK=${book.deployment.recordBook}`);
  log(`NEXT_PUBLIC_EPOCH_BOOK=${book.deployment.epochBook}`);
  log(`NEXT_PUBLIC_AGENT_ID=${out.agentId}`);
  log(`NEXT_PUBLIC_EPOCH_ID=${out.epochId}`);
  log(`NEXT_PUBLIC_GREEN_TX=${out.greenRevealTx}`);
  log(`NEXT_PUBLIC_RED_TX=${out.redTx}`);

  log('\n--- all artifacts ---');
  for (const [k, v] of Object.entries(out)) log(`${k.padEnd(16)} ${v}`);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
