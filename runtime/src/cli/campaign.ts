/**
 * A continuous forward campaign (PRD v2 §16 P7, claims ledger `forward-campaign`).
 *
 * The deep cryptographic proof already exists: one slot, verified byte for byte.
 * What it cannot show is that the agent keeps its promises over time, and that
 * is a claim only wall-clock can buy. A hundred slots at a five-minute cadence
 * is eight hours no amount of engineering compresses, which is why this should
 * be started early and left alone.
 *
 * Restartable on purpose. It reads the epoch's schedule off-chain state, skips
 * slots already committed, and lets slots whose deadline has passed stay missed.
 * A crash costs the slots it was actually down for and nothing else, which is
 * the honest outcome rather than a backfilled one.
 *
 *   NETWORK=mainnet AGENT=7 EPOCH=0 pnpm campaign
 *
 * Open the epoch first with `pnpm epoch --open-only`, or pass SLOT_COUNT and
 * CADENCE to have this open one.
 */

import {randomBytes} from 'node:crypto';
import {appendFileSync} from 'node:fs';

import {ZERO_ADDRESS, ZERO_HASH} from '@fief/reference';
import type {Address} from '@fief/reference';
import {keccak256, encodeAbiParameters, toHex} from 'viem';
import type {Hex as ViemHex} from 'viem';

import {BookClient} from '../book.js';
import {ComputeClient} from '../compute.js';
import {PROVIDERS, activeDeployment, requireEnv} from '../config.js';
import {runSlot, revealSlot, type RenterMessage} from '../loop.js';
import {demoStrategy, strategyHash} from '../strategy.js';

const SLOT_COUNT = Number(process.env.SLOT_COUNT ?? '288'); // 24h at 5min
const CADENCE = Number(process.env.CADENCE ?? '300');
const HORIZON = Number(process.env.HORIZON ?? '300');
const MAX_COMMIT_DELAY = Number(process.env.MAX_COMMIT_DELAY ?? '120');
const DISCLOSURE_DELAY = Number(process.env.DISCLOSURE_DELAY ?? '60');
const LEAD = Number(process.env.LEAD ?? '120');
const LOG = process.env.CAMPAIGN_LOG ?? 'campaign.log';

const log = (...a: unknown[]) => {
  const line = a.map(String).join(' ');
  console.log(line);
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // A log we cannot write must never take the campaign down with it.
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const pk = requireEnv('PRIVATE_KEY');
  const provider = PROVIDERS.glm;
  const book = new BookClient(activeDeployment(), pk);
  const compute = await ComputeClient.connect(pk, provider.address as Address);

  const strategy = demoStrategy();
  const H = strategyHash(strategy);

  let agentId: bigint;
  let epochId = BigInt(process.env.EPOCH ?? '0');

  if (process.env.AGENT !== undefined) {
    agentId = BigInt(process.env.AGENT);
    log(`resuming agent ${agentId} epoch ${epochId}`);
  } else {
    const reg = await book.register(H as ViemHex, ZERO_HASH as ViemHex, 'BTC short-horizon direction');
    agentId = reg.agentId;
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
        slotCount: SLOT_COUNT,
        strategyHash: H as ViemHex,
        providerSetHash: keccak256(
          encodeAbiParameters([{type: 'address'}], [provider.address as ViemHex]),
        ),
      },
      [provider.address as ViemHex],
    );
    log(`opened agent ${agentId} epoch ${epochId}: ${SLOT_COUNT} slots every ${CADENCE}s`);
    log(`  starts ${new Date(Number(startTime) * 1000).toISOString()}`);
  }

  const ctx = {
    agentId,
    epochId,
    strategyHash: H,
    renter: ZERO_ADDRESS as Address,
    book,
    compute,
    strategy,
  };

  const pending: RenterMessage[] = [];
  let committed = 0;
  let missed = 0;
  let revealed = 0;

  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const t = await book.slotTimes(agentId, epochId, slot);
    const now = await book.now();

    // Already committed on a previous run, or its window closed while we were
    // down. Either way the chain is the record and we do not rewrite it.
    const existing = await book.commitOf(agentId, epochId, slot);
    if (existing.committedAt !== 0n) {
      committed += 1;
      log(`slot ${slot}: already committed, skipping`);
      continue;
    }
    if (now > t.commitDeadline) {
      missed += 1;
      log(`slot ${slot}: MISSED (deadline passed while down)`);
      continue;
    }

    const waitMs = Number(t.snapshotAt - now) * 1000;
    if (waitMs > 0) await sleep(waitMs);

    const started = Date.now();
    const out = await runSlot({...ctx, slot});
    const took = ((Date.now() - started) / 1000).toFixed(1);

    if (out.kind === 'committed') {
      committed += 1;
      pending.push(out.message);
      log(`slot ${slot}: COMMITTED ${took}s ${out.message.decision ?? ''}`);
    } else {
      missed += 1;
      log(`slot ${slot}: MISSED ${took}s ${out.reason.split('\n')[0]}`);
    }

    // Reveal anything whose window has opened. Done inline so the campaign is a
    // single process with no second scheduler to fall out of sync.
    const nowAfter = await book.now();
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const m = pending[i];
      if (m === undefined) continue;
      const rt = await book.slotTimes(agentId, epochId, m.slot);
      if (nowAfter < rt.revealOpen) continue;
      try {
        await revealSlot(book, agentId, epochId, m);
        revealed += 1;
        pending.splice(i, 1);
        log(`slot ${m.slot}: REVEALED`);
      } catch (e) {
        log(`slot ${m.slot}: reveal failed, will retry: ${(e as Error).message.split('\n')[0]}`);
      }
    }

    const bps = await book.completenessBps(agentId, epochId);
    log(`  progress: ${committed} committed, ${revealed} revealed, ${missed} missed, ${bps / 100}%`);
  }

  // Drain whatever is still inside its disclosure delay.
  log('\nschedule complete, draining reveals');
  while (pending.length > 0) {
    const m = pending[0];
    if (m === undefined) break;
    const rt = await book.slotTimes(agentId, epochId, m.slot);
    const wait = Number(rt.revealOpen - (await book.now())) * 1000 + 3000;
    if (wait > 0) await sleep(wait);
    try {
      await revealSlot(book, agentId, epochId, m);
      revealed += 1;
      log(`slot ${m.slot}: REVEALED`);
    } catch (e) {
      log(`slot ${m.slot}: reveal failed permanently: ${(e as Error).message.split('\n')[0]}`);
    }
    pending.shift();
  }

  const meta = await book.epochMeta(agentId, epochId);
  log(`\ncampaign done: agent ${agentId} epoch ${epochId}`);
  log(`  ${meta.revealedCount} revealed of ${SLOT_COUNT} scheduled`);
  log(`  completeness ${(await book.completenessBps(agentId, epochId)) / 100}%`);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
