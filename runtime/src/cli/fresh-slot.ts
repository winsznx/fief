/**
 * Produce ONE fresh commit+reveal on an existing agent, fast.
 *
 * Written 2026-09-03 because 0G rotated the TEE signer key for our provider
 * sometime after the last campaign reveal, so every pre-rotation reveal now
 * fails re-verification against the live signer (correctly — the check does
 * exactly what it should). The fix is not to touch the old evidence; it is to
 * put one new reveal on the record, signed under the current key, for the
 * verifier demo to point at.
 *
 *   AGENT=8 EPOCH=1 pnpm fresh-slot
 */

import {randomBytes} from 'node:crypto';

import {ZERO_ADDRESS} from '@fief/reference';
import type {Address, Hex} from '@fief/reference';
import {keccak256, encodeAbiParameters, toHex} from 'viem';
import type {Hex as ViemHex} from 'viem';

import {BookClient} from '../book.js';
import {ComputeClient} from '../compute.js';
import {PROVIDERS, activeDeployment, requireEnv} from '../config.js';
import {demoStrategy, fetchSnapshot, inputHashOf, snapshotJson, strategyHash} from '../strategy.js';
import {
  buildCommitLine,
  buildExpectedCommit,
  buildReceiptCommit,
  findCommitOffset,
} from '@fief/reference';

const log = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AGENT = BigInt(process.env.AGENT ?? '8');
const EPOCH = BigInt(process.env.EPOCH ?? '1');
const LEAD = 20;
const CADENCE = 60;
const HORIZON = 15;
const MAX_COMMIT_DELAY = 45;
const DISCLOSURE_DELAY = 8;

async function main(): Promise<void> {
  const pk = requireEnv('PRIVATE_KEY');
  const book = new BookClient(activeDeployment(), pk);
  const provider = PROVIDERS.glm;
  const compute = await ComputeClient.connect(pk, provider.address as Address);
  const strategy = demoStrategy();
  const H = strategyHash(strategy);

  log(`agent ${AGENT}, epoch ${EPOCH}, provider ${provider.address}`);

  const startTime = (await book.now()) + BigInt(LEAD);
  const openTx = await book.openEpoch(
    AGENT,
    EPOCH,
    {
      market: keccak256(toHex('BTC-USDT')),
      cadenceSeconds: CADENCE,
      horizonSeconds: HORIZON,
      maxCommitDelay: MAX_COMMIT_DELAY,
      disclosureDelay: DISCLOSURE_DELAY,
      startTime,
      slotCount: 1,
      strategyHash: H as ViemHex,
      providerSetHash: keccak256(
        encodeAbiParameters([{type: 'address'}], [provider.address as ViemHex]),
      ),
    },
    [provider.address as ViemHex],
  );
  log(`openEpoch  ${book.txUrl(openTx)}`);

  const t = await book.slotTimes(AGENT, EPOCH, 0);
  const waitMs = Number(t.snapshotAt - (await book.now())) * 1000;
  if (waitMs > 0) {
    log(`waiting ${Math.round(waitMs / 1000)}s for the snapshot time`);
    await sleep(waitMs);
  }

  const snapshot = await fetchSnapshot('BTC-USDT', Number(t.snapshotAt));
  const inputHash = inputHashOf(snapshot);
  const parts = {
    book: book.deployment.recordBook as Address,
    chainId: book.deployment.network.chainId,
    agentId: AGENT.toString(),
    epochId: Number(EPOCH),
    slot: 0,
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
  if (commitOffset < 0) throw new Error('model did not echo the commit line');

  const salt = `0x${randomBytes(32).toString('hex')}` as Hex;
  const receiptCommit = buildReceiptCommit({
    respData: receipt.respData,
    signature: receipt.signature,
    commitOffset,
    inputHash,
    renter: ZERO_ADDRESS as Address,
    salt,
  });

  const commitTx = await book.commitDecision({
    agentId: AGENT,
    epochId: EPOCH,
    slot: 0,
    reqSha: receipt.reqSha as ViemHex,
    respSha: receipt.respSha as ViemHex,
    receiptCommit: receiptCommit as ViemHex,
    provider: provider.address as ViemHex,
  });
  log(`commit     ${book.txUrl(commitTx)}`);

  const t2 = await book.slotTimes(AGENT, EPOCH, 0);
  const waitReveal = Number(t2.revealOpen - (await book.now())) * 1000;
  if (waitReveal > 0) {
    log(`waiting ${Math.round(waitReveal / 1000)}s for disclosure`);
    await sleep(waitReveal + 2000);
  }

  const revealTx = await book.revealDecision({
    agentId: AGENT,
    epochId: EPOCH,
    slot: 0,
    respData: `0x${Buffer.from(receipt.respData, 'utf8').toString('hex')}` as ViemHex,
    signature: receipt.signature as ViemHex,
    commitOffset,
    inputHash: inputHash as ViemHex,
    renter: ZERO_ADDRESS as ViemHex,
    salt: salt as ViemHex,
  });
  log(`reveal     ${book.txUrl(revealTx)}`);
  log(`\nverify with:\n  cd packages/verify && pnpm fief-verify --tx ${revealTx}`);
}

main().catch((e: unknown) => {
  console.error('FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
