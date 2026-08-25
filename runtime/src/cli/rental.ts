/**
 * P4.5: the commercial loop, end to end, from a wallet that is not the deployer.
 *
 * The PRD gate is specific: "a real rental settled from a wallet that is not
 * the deployer". Renting to yourself proves nothing about the economics, so
 * this generates a separate renter keypair, funds it with dust, and drives the
 * whole flow from its own signer.
 *
 *   1. owner lists the agent
 *   2. renter rents, escrowing from their own balance
 *   3. the agent runs a slot NAMING THAT RENTER in the commit line
 *   4. the renter receives the cleartext at commit time and verifies it against
 *      the on-chain commitment before the reveal exists
 *   5. reveal
 *   6. settle: the owner is paid for a proven signal, minus the protocol fee
 *   7. both parties withdraw
 *
 * Step 4 is the product. Everything else is plumbing around it.
 */

import {randomBytes} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildCommitLine,
  buildExpectedCommit,
  buildReceiptCommit,
  commitMatchesAt,
  findCommitOffset,
} from '@fief/reference';
import type {Address, Hex} from '@fief/reference';
import {keccak256, encodeAbiParameters, toHex, formatEther, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Hex as ViemHex} from 'viem';

import {BookClient} from '../book.js';
import {ComputeClient} from '../compute.js';
import {PROVIDERS, activeDeployment, requireEnv} from '../config.js';
import {demoStrategy, fetchSnapshot, inputHashOf, snapshotJson, strategyHash} from '../strategy.js';

const FEE = parseEther(process.env.FEE ?? '0.0005');
const MIN_ESCROW = parseEther(process.env.MIN_ESCROW ?? '0.001');
const ESCROW = parseEther(process.env.ESCROW ?? '0.002');
const RENTER_GAS = parseEther(process.env.RENTER_GAS ?? '0.02');
const TERM_SECONDS = 7n * 24n * 60n * 60n;

const CADENCE = 150;
const MAX_COMMIT_DELAY = 120;
const HORIZON = 20;
const DISCLOSURE_DELAY = 10;
const LEAD = 25;

const log = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const og = (v: bigint) => `${formatEther(v)} OG`;

/** Persisted so a rerun reuses the same renter instead of stranding dust. */
function renterKey(): Hex {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.renter.json');
  if (existsSync(path)) {
    return (JSON.parse(readFileSync(path, 'utf8')) as {privateKey: Hex}).privateKey;
  }
  const pk = `0x${randomBytes(32).toString('hex')}` as Hex;
  writeFileSync(path, `${JSON.stringify({privateKey: pk, note: 'demo renter, dust only'}, null, 2)}\n`);
  return pk;
}

async function main(): Promise<void> {
  const ownerPk = requireEnv('PRIVATE_KEY');
  const provider = PROVIDERS.glm;

  const owner = new BookClient(activeDeployment(), ownerPk);
  const renterPk = renterKey();
  const renter = new BookClient(activeDeployment(), renterPk);
  const renterAddr = privateKeyToAccount(renterPk).address;

  log(`network  ${owner.deployment.network.chainId}`);
  log(`owner    ${owner.account.address}  ${og(await owner.balance())}`);
  log(`renter   ${renterAddr}  ${og(await renter.balance())}`);
  if (renterAddr.toLowerCase() === owner.account.address.toLowerCase()) {
    throw new Error('renter must not be the deployer');
  }

  /* ------------------------------------------------------------------ 0 */

  if ((await renter.balance()) < RENTER_GAS / 2n) {
    log(`\n[0] fund the renter with gas + escrow`);
    const tx = await owner.sendNative(renterAddr as ViemHex, RENTER_GAS);
    log(`   ${og(RENTER_GAS)} -> renter   ${owner.txUrl(tx)}`);
  }

  /* ------------------------------------------------------------------ 1 */

  log('\n[1] seal a strategy and register the agent');
  const strategy = demoStrategy();
  const H = strategyHash(strategy);
  // The blob is already on 0G Storage from the showcase run; this proves the
  // rental loop, so it reuses the commitment rather than re-uploading.
  const {agentId} = await owner.register(H as ViemHex, H as ViemHex, 'BTC short-horizon direction');
  log(`   agentId ${agentId}`);

  log('\n[2] owner lists the agent');
  const listTx = await owner.list(agentId, FEE, MIN_ESCROW, TERM_SECONDS);
  log(`   fee ${og(FEE)} per decision, min escrow ${og(MIN_ESCROW)}, term 7d`);
  log(`   ${owner.txUrl(listTx)}`);

  /* ------------------------------------------------------------------ 3 */

  log('\n[3] open the epoch, then the RENTER rents it');
  const epochId = 0n;
  const startTime = (await owner.now()) + BigInt(LEAD);
  await owner.openEpoch(
    agentId,
    epochId,
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

  const rentTx = await renter.rent(agentId, epochId, ESCROW);
  const grant = await owner.grantOf(agentId, renterAddr as ViemHex);
  log(`   renter escrowed ${og(ESCROW)} -> ${grant.maxDecisions} decisions, expiry ${grant.expiry}`);
  log(`   ${renter.txUrl(rentTx)}`);

  /* ------------------------------------------------------------------ 4 */

  log('\n[4] the agent decides FOR THIS RENTER');
  const compute = await ComputeClient.connect(ownerPk, provider.address as Address);
  const t = await owner.slotTimes(agentId, epochId, 0);
  const waitMs = Number(t.snapshotAt - (await owner.now())) * 1000;
  if (waitMs > 0) {
    log(`   waiting ${Math.round(waitMs / 1000)}s for the slot`);
    await sleep(waitMs);
  }

  const snapshot = await fetchSnapshot('BTC-USDT', Number(t.snapshotAt));
  const inputHash = inputHashOf(snapshot);
  // The renter's address is IN the commit line, so the TEE signs a response
  // bound to them. That is what lets settle() prove the fee is owed.
  const parts = {
    book: owner.deployment.recordBook as Address,
    chainId: owner.deployment.network.chainId,
    agentId: agentId.toString(),
    epochId: Number(epochId),
    slot: 0,
    strategyHash: H,
    inputHash,
    renter: renterAddr.toLowerCase() as Address,
  };

  const receipt = await compute.infer({
    commitLine: buildCommitLine(parts),
    strategyPrompt: strategy.systemPrompt,
    snapshotJson: snapshotJson(snapshot),
  });
  const exp = buildExpectedCommit(parts);
  const commitOffset = findCommitOffset(receipt.respData, exp);
  if (commitOffset < 0) throw new Error('model did not echo the commit line');

  const salt = `0x${randomBytes(32).toString('hex')}` as Hex;
  const receiptCommit = buildReceiptCommit({
    respData: receipt.respData,
    signature: receipt.signature,
    commitOffset,
    inputHash,
    renter: renterAddr.toLowerCase() as Address,
    salt,
  });

  const commitTx = await owner.commitDecision({
    agentId,
    epochId,
    slot: 0,
    reqSha: receipt.reqSha as ViemHex,
    respSha: receipt.respSha as ViemHex,
    receiptCommit: receiptCommit as ViemHex,
    provider: provider.address as ViemHex,
  });
  log(`   COMMIT (sealed, public sees no direction)  ${owner.txUrl(commitTx)}`);

  /* ------------------------------------------------------------------ 5 */

  log('\n[5] the renter receives the signal and verifies it BEFORE any reveal');
  const decision = receipt.content?.split('\n')[1]?.trim() ?? null;
  log(`   feed -> ${decision}`);

  // The renter recomputes the commitment from the payload they were handed and
  // checks it against what the chain already holds. This is the whole trust
  // model of the private phase: they do not have to believe the feed.
  const onChain = await owner.commitOf(agentId, epochId, 0);
  const recomputed = buildReceiptCommit({
    respData: receipt.respData,
    signature: receipt.signature,
    commitOffset,
    inputHash,
    renter: renterAddr.toLowerCase() as Address,
    salt,
  });
  const opens = recomputed.toLowerCase() === onChain.receiptCommit.toLowerCase();
  const bound = commitMatchesAt(receipt.respData, exp, commitOffset);
  log(`   payload opens the on-chain commitment : ${opens}`);
  log(`   commit line names this renter         : ${bound}`);
  if (!opens || !bound) throw new Error('renter-side verification failed');

  /* ------------------------------------------------------------------ 6 */

  log('\n[6] reveal after the disclosure window');
  const waitReveal = Number(t.revealOpen - (await owner.now())) * 1000 + 3000;
  if (waitReveal > 0) await sleep(waitReveal);
  const revealTx = await owner.revealDecision({
    agentId,
    epochId,
    slot: 0,
    respData: `0x${Buffer.from(receipt.respData, 'utf8').toString('hex')}` as ViemHex,
    signature: receipt.signature as ViemHex,
    commitOffset,
    inputHash: inputHash as ViemHex,
    renter: renterAddr as ViemHex,
    salt: salt as ViemHex,
  });
  log(`   REVEAL  ${owner.txUrl(revealTx)}`);

  /* ------------------------------------------------------------------ 7 */

  log('\n[7] settle the proven slot');
  const settleTx = await owner.settle(agentId, renterAddr as ViemHex, [0]);
  const after = await owner.grantOf(agentId, renterAddr as ViemHex);
  const ownerOwed = await owner.withdrawable(owner.account.address as ViemHex);
  const treasuryOwed = await owner.withdrawable(owner.account.address as ViemHex);

  log(`   settled ${after.settledCount} slot(s), ${og(after.settledWei)} consumed`);
  log(`   remaining escrow ${og(after.remainingWei)}`);
  log(`   owner withdrawable ${og(ownerOwed)} (treasury share ${og(treasuryOwed)} to the same address on this deploy)`);
  log(`   ${owner.txUrl(settleTx)}`);

  log('\n[8] owner withdraws (pull payment)');
  if (ownerOwed > 0n) {
    const wTx = await owner.withdraw();
    log(`   ${owner.txUrl(wTx)}`);
  }

  log('\n--- result ---');
  log(`agentId          ${agentId}`);
  log(`renter           ${renterAddr}`);
  log(`rentTx           ${rentTx}`);
  log(`commitTx         ${commitTx}`);
  log(`revealTx         ${revealTx}`);
  log(`settleTx         ${settleTx}`);
  log(`renter balance   ${og(await renter.balance())}`);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
