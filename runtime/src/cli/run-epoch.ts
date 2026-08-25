/**
 * P3 end-to-end: a real forward epoch on 0G testnet 16602.
 *
 * Proves the whole loop against live infrastructure, in order:
 *   1. register an agent with a sealed strategy hash
 *   2. open a forward epoch whose schedule is fixed BEFORE any slot exists
 *   3. for each slot: real 0G Compute inference, real TEE receipt, sealed commit
 *      inside the deadline
 *   4. after the disclosure window: reveal, byte-exact verified on-chain
 *   5. finalize and read back the completeness the chain computed
 *
 * Compute runs on mainnet where the ledger is funded; the contracts are on
 * testnet. See config.ts for why, and for why the signer is pinned here.
 */

import {ZERO_ADDRESS, ZERO_HASH} from '@fief/reference';
import type {Address} from '@fief/reference';
import type {Hex as ViemHex} from 'viem';
import {keccak256, encodeAbiParameters, toHex} from 'viem';

import {BookClient} from '../book.js';
import {ComputeClient} from '../compute.js';
import {PROVIDERS, activeDeployment, requireEnv} from '../config.js';
import {runSlot, revealSlot, type RenterMessage} from '../loop.js';
import {demoStrategy, strategyHash} from '../strategy.js';

const SLOT_COUNT = Number(process.env.SLOT_COUNT ?? '3');
const CADENCE = Number(process.env.CADENCE ?? '120');
const HORIZON = Number(process.env.HORIZON ?? '30');
const MAX_COMMIT_DELAY = Number(process.env.MAX_COMMIT_DELAY ?? '90');
const DISCLOSURE_DELAY = Number(process.env.DISCLOSURE_DELAY ?? '10');
const LEAD = Number(process.env.LEAD ?? '30');

const log = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const pk = requireEnv('PRIVATE_KEY');
  const provider = PROVIDERS.glm;

  const book = new BookClient(activeDeployment(), pk);
  log(`operator   ${book.account.address}`);
  log(`balance    ${Number(await book.balance()) / 1e18} OG on ${book.deployment.network.chainId}`);

  log('\n[1] connect 0G Compute (mainnet, funded ledger)');
  const compute = await ComputeClient.connect(pk, provider.address as Address);
  log(`   provider ${compute.provider}  model ${compute.model}`);

  // The testnet InferenceServing does not know a mainnet provider, so the
  // signer is pinned with evidence. Documented narrowing, PRD v2 §5 / §20.
  const resolved = await book.expectedTeeSigner(provider.address as ViemHex);
  if (resolved.toLowerCase() !== provider.teeSigner.toLowerCase()) {
    log(`   pinning TEE signer ${provider.teeSigner} (testnet cannot resolve a mainnet provider)`);
    await book.pinSigner(
      provider.address as ViemHex,
      provider.teeSigner as ViemHex,
      'PRD v2 section 0.6.1: mainnet getService read 2026-08-25',
    );
  }

  log('\n[2] register agent with sealed strategy');
  const strategy = demoStrategy();
  const H = strategyHash(strategy);
  const {agentId, hash: regTx} = await book.register(H as ViemHex, ZERO_HASH as ViemHex, 'BTC short-horizon direction');
  log(`   agentId ${agentId}  H ${H}`);
  log(`   ${book.txUrl(regTx)}`);

  log('\n[3] open forward epoch (schedule fixed before any outcome exists)');
  const epochId = 0n;
  const chainNow = await book.now();
  const startTime = chainNow + BigInt(LEAD);

  const openTx = await book.openEpoch(agentId, epochId, {
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
  }, [provider.address as ViemHex]);
  log(`   epoch ${epochId}: ${SLOT_COUNT} slots, cadence ${CADENCE}s, start ${startTime}`);
  log(`   provider pinned in the same tx (no race against startTime)`);
  log(`   ${book.txUrl(openTx)}`);

  log('\n[4] run the schedule');
  const strategyCtx = {agentId, epochId, strategyHash: H, renter: ZERO_ADDRESS as Address, book, compute, strategy};
  const delivered: RenterMessage[] = [];
  const missed: Array<{slot: number; reason: string}> = [];

  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const t = await book.slotTimes(agentId, epochId, slot);
    const waitMs = Number(t.snapshotAt - (await book.now())) * 1000;
    if (waitMs > 0) {
      log(`   slot ${slot}: waiting ${Math.round(waitMs / 1000)}s for snapshot time`);
      await sleep(waitMs);
    }

    const started = Date.now();
    const out = await runSlot({...strategyCtx, slot});
    const took = ((Date.now() - started) / 1000).toFixed(1);

    if (out.kind === 'committed') {
      delivered.push(out.message);
      log(`   slot ${slot}: COMMITTED in ${took}s  decision=${out.message.decision}`);
      log(`             ${book.txUrl(out.commitTx)}`);
    } else {
      missed.push({slot, reason: out.reason});
      log(`   slot ${slot}: MISSED after ${took}s -> ${out.reason.split('\n')[0]}`);
    }
  }

  log('\n[5] reveal after the disclosure window');
  for (const m of delivered) {
    const t = await book.slotTimes(agentId, epochId, m.slot);
    const waitMs = Number(t.revealOpen - (await book.now())) * 1000;
    if (waitMs > 0) {
      log(`   slot ${m.slot}: waiting ${Math.round(waitMs / 1000)}s for reveal window`);
      await sleep(waitMs + 2000);
    }
    const tx = await revealSlot(book, agentId, epochId, m);
    log(`   slot ${m.slot}: REVEALED  ${book.txUrl(tx)}`);
  }

  log('\n[6] epoch summary');
  const meta = await book.epochMeta(agentId, epochId);
  log(`   committed ${meta.committedCount} / ${SLOT_COUNT}`);
  log(`   revealed  ${meta.revealedCount}`);
  log(`   missed    ${SLOT_COUNT - meta.committedCount}`);
  log(`   completeness ${(await book.completenessBps(agentId, epochId)) / 100}%`);
  if (missed.length > 0) {
    log('   missed detail:');
    for (const m of missed) log(`     slot ${m.slot}: ${m.reason.split('\n')[0]}`);
  }

  log(`\nagentId=${agentId} epochId=${epochId} recordBook=${book.deployment.recordBook}`);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
