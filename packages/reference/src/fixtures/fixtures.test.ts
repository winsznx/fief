/**
 * Fixture integrity (PRD v2 §11).
 *
 * The Foundry suite consumes `fixtures/slots.json` and is forbidden from
 * restating expected values inline. That only works if the fixtures provably
 * agree with the reference model, so this test re-derives every field from the
 * committed JSON rather than trusting it.
 *
 * If this fails, the fixtures are stale: re-run `pnpm fixtures`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildCommitLine, buildExpectedCommit, commitMatchesAt } from '../commit.js';
import { buildReceiptCommit, recoverSigner, sha256Hex, signedText } from '../receipt.js';
import { slotCommitDeadline, slotRevealOpen, slotSnapshotTime } from '../epoch.js';
import type { Address, EpochSpec, Hex } from '../types.js';

interface SlotVector {
  name: string;
  slot: number;
  commitLine: string;
  exp: string;
  respData: string;
  commitOffset: number;
  reqSha: Hex;
  respSha: Hex;
  signedText: string;
  signature: Hex;
  receiptCommit: Hex;
  inputHash: Hex;
  renter: Address;
  salt: Hex;
  snapshotTime: number;
  commitDeadline: number;
  revealOpen: number;
  expectedReject: string | null;
}

interface Bundle {
  chainId: number;
  book: Address;
  agentId: string;
  epochId: number;
  provider: Address;
  teeSigner: Address;
  spec: EpochSpec;
  vectors: SlotVector[];
}

const bundlePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'slots.json');
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as Bundle;

describe('fixtures/slots.json', () => {
  it('is non-empty and carries both honest and adversarial vectors', () => {
    expect(bundle.vectors.length).toBeGreaterThan(0);
    expect(bundle.vectors.some((v) => v.expectedReject === null)).toBe(true);
    expect(bundle.vectors.some((v) => v.expectedReject !== null)).toBe(true);
  });

  describe.each(bundle.vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    it('respData hashes to the recorded respSha', () => {
      expect(sha256Hex(v.respData)).toBe(v.respSha);
    });

    it('the recorded signed text is the 129-byte pair', () => {
      const text = signedText(v.reqSha, v.respSha);
      expect(text).toBe(v.signedText);
      expect(text).toHaveLength(129);
    });

    it('the signature recovers to the bundle TEE signer', () => {
      expect(recoverSigner(v.signedText, v.signature).toLowerCase()).toBe(
        bundle.teeSigner.toLowerCase(),
      );
    });

    it('the receipt commitment opens with the recorded payload', () => {
      expect(
        buildReceiptCommit({
          respData: v.respData,
          signature: v.signature,
          commitOffset: v.commitOffset,
          inputHash: v.inputHash,
          renter: v.renter,
          salt: v.salt,
        }),
      ).toBe(v.receiptCommit);
    });

    it('the slot timings match the spec-derived schedule', () => {
      expect(v.snapshotTime).toBe(slotSnapshotTime(bundle.spec, v.slot));
      expect(v.commitDeadline).toBe(slotCommitDeadline(bundle.spec, v.slot));
      expect(v.revealOpen).toBe(slotRevealOpen(bundle.spec, v.slot));
    });

    it('EXP matches at commitOffset exactly when the vector is honest', () => {
      // The contract rebuilds EXP from its own state, so we rebuild it here too
      // rather than reusing the vector's recorded `exp`.
      const rebuilt = buildExpectedCommit({
        book: bundle.book,
        chainId: bundle.chainId,
        agentId: bundle.agentId,
        epochId: bundle.epochId,
        slot: v.slot,
        strategyHash: bundle.spec.strategyHash,
        inputHash: v.inputHash,
        renter: v.renter,
      });

      const matched = commitMatchesAt(v.respData, rebuilt, v.commitOffset);
      expect(matched).toBe(v.expectedReject === null);
    });

    it('the recorded commit line round-trips through the builder when honest', () => {
      if (v.expectedReject !== null) return;
      expect(
        buildCommitLine({
          book: bundle.book,
          chainId: bundle.chainId,
          agentId: bundle.agentId,
          epochId: bundle.epochId,
          slot: v.slot,
          strategyHash: bundle.spec.strategyHash,
          inputHash: v.inputHash,
          renter: v.renter,
        }),
      ).toBe(v.commitLine);
    });
  });
});
