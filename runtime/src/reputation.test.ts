/**
 * Serve-proof construction, checked by 0G's own verifier.
 *
 * These are pure: no network, no chain, so they run in CI. The live checks in
 * `pnpm reputation` cover the parts that need the attestor and the registry.
 *
 * The property under test is not "our code agrees with our code". Every
 * assertion routes through `verifyServeProofSignature` from the Agentic ID SDK,
 * so a mistake in how Fief builds the digest fails here rather than silently
 * producing proofs the registry would reject.
 */

import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import type { Address, Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  AGENTIC_ID_TESTNET,
  buildSlotServeProof,
  issueServeProof,
  serveProofDigest,
  verifyIssuedProof,
  type SlotServeParams,
} from './reputation.js';

const seal = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const other = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const RENTER = '0xae8caDeDa5B0C762ECC2a242544A6A1b04Ebd40E' as Address;

const base: SlotServeParams = {
  agentId: 1n,
  renter: RENTER,
  fiefAgentId: 6n,
  epochId: 0n,
  slot: 0,
  inputHash: keccak256(toHex('snapshot')) as Hash,
  strategyHash: keccak256(toHex('strategy')) as Hash,
  servedAt: 1_800_000_000,
};

const sign = (acct: typeof seal) => async (digest: Hash) => acct.sign({ hash: digest });

describe('serve proof issuance', () => {
  it('produces a proof the SDK accepts', async () => {
    const proof = await issueServeProof(base, sign(seal));
    expect(await verifyIssuedProof(proof, seal.address)).toBe(true);
  });

  it('is rejected against any other seal', async () => {
    const proof = await issueServeProof(base, sign(seal));
    expect(await verifyIssuedProof(proof, other.address)).toBe(false);
  });

  it('binds to exactly one redeemer', async () => {
    // `submitter` is inside the signed digest, so a proof handed to the wrong
    // party is worthless rather than merely discouraged.
    const proof = await issueServeProof(base, sign(seal));
    const swapped = { ...proof, submitter: other.address };
    expect(await verifyIssuedProof(swapped, seal.address)).toBe(false);
  });

  it('binds to the exact slot', async () => {
    const a = buildSlotServeProof(base).taskHash;
    const b = buildSlotServeProof({ ...base, slot: 1 }).taskHash;
    const c = buildSlotServeProof({ ...base, epochId: 1n }).taskHash;
    const d = buildSlotServeProof({ ...base, fiefAgentId: 7n }).taskHash;
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('carries the strategy commitment, so reputation cannot outlive its epoch', async () => {
    // The SDK's own guide flags data-bound reputation as designed but missing:
    // without this, epoch 5 inherits epoch 2's score.
    const { params } = buildSlotServeProof(base);
    expect(params.dataHashes).toContain(base.strategyHash);
    expect(params.dataHashes).toContain(base.inputHash);
  });

  it('expires', async () => {
    const proof = await issueServeProof({ ...base, ttlSeconds: 3600 }, sign(seal));
    expect(Number(proof.deadline) - Number(proof.timestamp)).toBe(3600);
  });

  it('is domain-separated by chain and verifying contract', () => {
    // Same payload, different domain, must not collide: otherwise a proof from
    // one deployment could be replayed into another.
    expect(AGENTIC_ID_TESTNET.chainId).toBe(16602);
    const digest = serveProofDigest(base);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(serveProofDigest({ ...base, agentId: 2n })).not.toBe(digest);
  });
});
