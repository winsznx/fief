/**
 * P3 adversarial proof: the failures must be as real as the successes.
 *
 * Three attacks, run against the live testnet deployment with a genuine
 * TEE-signed receipt as the starting material:
 *
 *   A. LATE COMMIT   - wait past the slot's commit deadline, then submit.
 *                      This is the v1 omission attack: see the outcome first,
 *                      then decide whether to record. Must revert.
 *   B. TAMPERED BYTE - alter one byte of the response and reveal. The demo's
 *                      red transaction. Must revert.
 *   C. EARLY REVEAL  - open the commitment before the disclosure window. This
 *                      would hand the alpha away for free. Must revert.
 *
 * A run where any of these succeeds falsifies the §2 claim.
 */

import {randomBytes} from 'node:crypto';

import {ZERO_ADDRESS, ZERO_HASH, buildCommitLine, buildExpectedCommit, buildReceiptCommit, findCommitOffset} from '@fief/reference';
import type {Address} from '@fief/reference';
import type {Hex as ViemHex} from 'viem';
import {keccak256, encodeAbiParameters, toHex} from 'viem';

import {BookClient} from '../book.js';
import {ComputeClient} from '../compute.js';
import {PROVIDERS, activeDeployment, requireEnv} from '../config.js';
import {demoStrategy, fetchSnapshot, inputHashOf, snapshotJson, strategyHash} from '../strategy.js';

const log = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The commit window must be wide enough for a real inference (~30s), otherwise
// the honest path in B/D fails for the wrong reason. Lateness in A is reached
// by waiting past the deadline, not by making the window unusably tight.
const CADENCE = 180;
const MAX_COMMIT_DELAY = 120;
const HORIZON = 20;
const DISCLOSURE_DELAY = 30;
const LEAD = 30;

let passes = 0;
let failures = 0;

function expectRevert(name: string, err: unknown, wanted: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes(wanted)) {
    log(`   PASS  ${name} rejected with ${wanted}`);
    passes += 1;
  } else {
    log(`   FAIL  ${name}: expected ${wanted}, got: ${msg.split('\n')[0]}`);
    failures += 1;
  }
}

function expectNoSuccess(name: string): void {
  log(`   FAIL  ${name} SUCCEEDED but must have been rejected`);
  failures += 1;
}

async function main(): Promise<void> {
  const pk = requireEnv('PRIVATE_KEY');
  const provider = PROVIDERS.glm;
  const book = new BookClient(activeDeployment(), pk);
  const compute = await ComputeClient.connect(pk, provider.address as Address);

  const strategy = demoStrategy();
  const H = strategyHash(strategy);

  log('[setup] register agent + open a fresh epoch with a tight commit deadline');
  const {agentId} = await book.register(H as ViemHex, ZERO_HASH as ViemHex, 'adversarial');
  const epochId = 0n;
  const startTime = (await book.now()) + BigInt(LEAD);

  await book.openEpoch(
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
  log(`   agentId ${agentId}, epoch ${epochId}, maxCommitDelay ${MAX_COMMIT_DELAY}s`);

  /* ------------------------------------------------------------------ A */

  log('\n[A] LATE COMMIT — the v1 omission attack');
  const t0 = await book.slotTimes(agentId, epochId, 0);
  const waitPast = Number(t0.commitDeadline - (await book.now())) * 1000 + 5000;
  log(`   waiting ${Math.round(waitPast / 1000)}s so slot 0's deadline has passed`);
  await sleep(waitPast);

  try {
    await book.commitDecision({
      agentId,
      epochId,
      slot: 0,
      reqSha: ZERO_HASH as ViemHex,
      respSha: ZERO_HASH as ViemHex,
      receiptCommit: ZERO_HASH as ViemHex,
      provider: provider.address as ViemHex,
    });
    expectNoSuccess('late commit');
  } catch (e) {
    expectRevert('late commit', e, 'SlotDeadlinePassed');
  }

  /* ------------------------------------------------------------------ B/C */

  log('\n[B/C] produce a genuine receipt for slot 1, then attack it');
  const t1 = await book.slotTimes(agentId, epochId, 1);
  const waitSnap = Number(t1.snapshotAt - (await book.now())) * 1000;
  if (waitSnap > 0) {
    log(`   waiting ${Math.round(waitSnap / 1000)}s for slot 1's snapshot time`);
    await sleep(waitSnap);
  }

  const snapshot = await fetchSnapshot('BTC-USDT', Number(t1.snapshotAt));
  const inputHash = inputHashOf(snapshot);
  const parts = {
    book: book.deployment.recordBook as Address,
    chainId: book.deployment.network.chainId,
    agentId: agentId.toString(),
    epochId: Number(epochId),
    slot: 1,
    strategyHash: H,
    inputHash,
    renter: ZERO_ADDRESS as Address,
  };

  const receipt = await compute.infer({
    commitLine: buildCommitLine(parts),
    strategyPrompt: strategy.systemPrompt,
    snapshotJson: snapshotJson(snapshot),
  });
  const exp = buildExpectedCommit(parts);
  const commitOffset = findCommitOffset(receipt.respData, exp);
  if (commitOffset < 0) throw new Error('model did not echo the commit line; rerun');

  const salt = `0x${randomBytes(32).toString('hex')}` as const;
  const receiptCommit = buildReceiptCommit({
    respData: receipt.respData,
    signature: receipt.signature,
    commitOffset,
    inputHash,
    renter: ZERO_ADDRESS as Address,
    salt,
  });

  await book.commitDecision({
    agentId,
    epochId,
    slot: 1,
    reqSha: receipt.reqSha as ViemHex,
    respSha: receipt.respSha as ViemHex,
    receiptCommit: receiptCommit as ViemHex,
    provider: provider.address as ViemHex,
  });
  log('   slot 1 committed with a genuine TEE receipt');

  const honestReveal = {
    agentId,
    epochId,
    slot: 1,
    respData: `0x${Buffer.from(receipt.respData, 'utf8').toString('hex')}` as ViemHex,
    signature: receipt.signature as ViemHex,
    commitOffset,
    inputHash: inputHash as ViemHex,
    renter: ZERO_ADDRESS as ViemHex,
    salt: salt as ViemHex,
  };

  log('\n[C] EARLY REVEAL — would give the alpha away before the horizon');
  try {
    await book.revealDecision(honestReveal);
    expectNoSuccess('early reveal');
  } catch (e) {
    expectRevert('early reveal', e, 'RevealTooEarly');
  }

  log('\n[B] TAMPERED BYTE — the demo red transaction');
  const waitReveal = Number(t1.revealOpen - (await book.now())) * 1000 + 3000;
  if (waitReveal > 0) {
    log(`   waiting ${Math.round(waitReveal / 1000)}s for the disclosure window`);
    await sleep(waitReveal);
  }

  // Flip one byte of the signed response. The published commitment no longer
  // opens, so the chain refuses it.
  const tamperedBytes = Buffer.from(receipt.respData, 'utf8');
  const at = tamperedBytes.length - 3;
  tamperedBytes[at] = tamperedBytes[at] === 0x30 ? 0x31 : 0x30;
  log(`   flipped one byte at offset ${at} of ${tamperedBytes.length}`);

  try {
    await book.revealDecision({
      ...honestReveal,
      respData: `0x${tamperedBytes.toString('hex')}` as ViemHex,
    });
    expectNoSuccess('tampered reveal');
  } catch (e) {
    expectRevert('tampered reveal', e, 'BadReveal');
  }

  log('\n[D] the honest reveal of the same slot still succeeds');
  try {
    const tx = await book.revealDecision(honestReveal);
    log(`   PASS  honest reveal accepted  ${book.txUrl(tx)}`);
    passes += 1;
  } catch (e) {
    log(`   FAIL  honest reveal rejected: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    failures += 1;
  }

  log(`\nRESULT: ${passes} passed, ${failures} failed`);
  log(`agentId=${agentId} epochId=${epochId} recordBook=${book.deployment.recordBook}`);
  if (failures > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
