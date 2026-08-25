/**
 * Prove Fief can issue a valid ERC-8004 serve proof, against live 0G testnet.
 *
 * The point of this script is to be falsifiable rather than reassuring. It
 * does four things and reports honestly on each:
 *
 *   1. reads the production attestor's live config and checks the registry
 *      addresses this repo pins still match
 *   2. builds a serve proof binding a real Fief slot, signs it with a stand-in
 *      seal, and verifies it with the SDK's OWN verifier, so the claim "Fief
 *      issues valid ServeProofs" is checked by 0G's code and not by ours
 *   3. shows the proof is bound to one redeemer, by verifying that changing the
 *      submitter changes the digest
 *   4. reads the live ReputationRegistry on chain
 *
 * What it does NOT do, and why: `giveFeedback` needs an agent that exists in
 * the AgenticID registry with a registered `agentSeal`, and minting one
 * requires a trusted attestor to deploy the agent into 0G's TEE sandbox
 * (DEPLOYMENT.md: mint reverts AgenticIDNotTrustedAttestor otherwise). That is
 * a sandbox-runtime integration, not a signature problem, and it is scoped as
 * the remaining leg rather than faked here.
 */

import {privateKeyToAccount} from 'viem/accounts';
import {keccak256, toHex} from 'viem';
import type {Address, Hash} from 'viem';

import {
  AGENTIC_ID_TESTNET,
  assertAddressesCurrent,
  buildSlotServeProof,
  fetchAttestorConfig,
  issueServeProof,
  readSummary,
  registryReachable,
  serveProofDigest,
  verifyIssuedProof,
} from '../reputation.js';

const log = (...a: unknown[]) => console.log(...a);
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${detail}`}`);
  ok ? (pass += 1) : (fail += 1);
};

async function main(): Promise<void> {
  log('[1] attestor config (live)');
  const cfg = await fetchAttestorConfig();
  log(`   chain ${cfg.chain_id}, frameworks: ${cfg.frameworks.map((f) => f.name).join(', ')}`);
  const drift = await assertAddressesCurrent();
  check('pinned registry addresses match the attestor', drift.ok, drift.drift.join(', '));

  log('\n[2] issue a serve proof for a real Fief slot');
  // A stand-in for the agentSeal. In production this key lives inside the TEE
  // sandbox and never leaves it; here it only has to prove the construction is
  // right, which is a property of the digest, not of who holds the key.
  const sealAccount = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  const servedAt = Math.floor(Date.parse('2026-08-25T12:00:00Z') / 1000);

  const params = {
    agentId: 1n,
    renter: '0xae8caDeDa5B0C762ECC2a242544A6A1b04Ebd40E' as Address,
    fiefAgentId: 6n,
    epochId: 0n,
    slot: 0,
    inputHash: keccak256(toHex('snapshot')) as Hash,
    strategyHash: keccak256(toHex('strategy')) as Hash,
    servedAt,
  };

  const {taskHash} = buildSlotServeProof(params);
  log(`   taskHash binds agent/epoch/slot/renter: ${taskHash}`);

  const proof = await issueServeProof(params, async (digest) => sealAccount.sign({hash: digest}));
  log(`   signed by ${sealAccount.address}`);
  log(`   deadline  ${new Date(Number(proof.deadline) * 1000).toISOString()}`);

  // The SDK's own verifier is the judge here, not ours.
  check(
    'the SDK verifies our proof against the seal',
    await verifyIssuedProof(proof, sealAccount.address),
  );
  check(
    'the SDK rejects it against a different seal',
    !(await verifyIssuedProof(proof, '0x000000000000000000000000000000000000dEaD')),
  );

  log('\n[3] the proof is bound to one redeemer');
  const other = serveProofDigest({
    ...params,
    renter: '0x000000000000000000000000000000000000bEEF' as Address,
  });
  check('changing the submitter changes the digest', other !== serveProofDigest(params));
  check(
    'the SDK rejects a proof whose submitter was swapped',
    !(await verifyIssuedProof({...proof, submitter: '0x000000000000000000000000000000000000bEEF'}, sealAccount.address)),
  );

  log('\n[4] live ReputationRegistry on testnet');
  const reach = await registryReachable();
  log(`   ${AGENTIC_ID_TESTNET.reputationRegistry}`);
  check('registry is deployed at the pinned address', reach.deployed, `${reach.codeSize} bytes`);

  // A revert for an agent nobody minted is correct behaviour, so this reports
  // what it finds rather than treating an empty registry as a failure.
  let answered = 0;
  for (const id of [0n, 1n, 2n, 3n]) {
    try {
      const s = await readSummary(id);
      answered += 1;
      log(`   agent ${id}: count=${s.count} value=${s.summaryValue} decimals=${s.decimals}`);
    } catch {
      log(`   agent ${id}: not registered`);
    }
  }
  log(`   ${answered} of 4 probed ids are registered`);

  log(`\nRESULT: ${pass} passed, ${fail} failed`);
  log(
    '\nRemaining leg: giveFeedback needs an AgenticID-minted agent with a registered\n' +
      'agentSeal, which requires a trusted attestor to deploy it into 0G\'s TEE sandbox.\n' +
      'That is a sandbox-runtime integration, tracked rather than stubbed.',
  );
  if (fail > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error('\nFATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
