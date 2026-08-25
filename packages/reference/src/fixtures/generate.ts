/**
 * Fixture generator (PRD v2 §11).
 *
 * Emits JSON vectors consumed by the Foundry suite. The contract tests must
 * import these and never restate expected values inline: if Solidity and the
 * reference model disagree, exactly one of them is wrong and the fixture is the
 * arbiter.
 *
 * Deterministic by construction. No clock, no randomness, fixed keys, so the
 * output is byte-stable across runs and a diff in CI means a real behavioural
 * change rather than noise.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';

import { ZERO_ADDRESS, buildCommitLine, buildExpectedCommit, buildRespData, tamperStrategyByte } from '../commit.js';
import { buildReceiptCommit, eip191Digest, sha256Hex, signedText } from '../receipt.js';
import { slotCommitDeadline, slotRevealOpen, slotSnapshotTime } from '../epoch.js';
import type { Address, EpochSpec, Hex } from '../types.js';

const T0 = 1_800_000_000;
const BOOK = '0x00000000000000000000000000000000000000b0' as Address;
const PROVIDER = '0x7dcfe6aea70350c2090041524c9b4a9262dce87d' as Address;
const H = `0x${'ab'.repeat(32)}` as Hex;
const SALT = `0x${'11'.repeat(32)}` as Hex;

const TEE_PRIV = new Uint8Array(32).fill(7);
const TEE_SIGNER =
  `0x${Buffer.from(keccak_256(secp256k1.getPublicKey(TEE_PRIV, false).subarray(1)))
    .subarray(12)
    .toString('hex')}` as Address;

function signAsTee(message: string): Hex {
  const digest = Buffer.from(eip191Digest(message).slice(2), 'hex');
  const sig = secp256k1.sign(digest, TEE_PRIV, { prehash: false });
  return `0x${sig.r.toString(16).padStart(64, '0')}${sig.s
    .toString(16)
    .padStart(64, '0')}${(sig.recovery + 27).toString(16).padStart(2, '0')}` as Hex;
}

const SPEC: EpochSpec = {
  market: 'BTC-USDT',
  cadenceSeconds: 300,
  horizonSeconds: 300,
  maxCommitDelay: 30,
  disclosureDelay: 60,
  startTime: T0,
  slotCount: 12,
  strategyHash: H,
  providerSet: [PROVIDER],
};

interface SlotVector {
  name: string;
  /** Explicit rather than inferred from `expectedReject`: a JSON null reads as
   *  the string "null" through Foundry's cheatcodes, which silently inverted
   *  the honest/adversarial split the first time round. */
  honest: boolean;
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
  /** null means the reveal is expected to succeed. */
  expectedReject: string | null;
}

function honestSlot(slot: number, name = `honest-slot-${slot}`): SlotVector {
  const inputHash = sha256Hex(`snapshot-${slot}`);
  const commitLine = buildCommitLine({
    book: BOOK,
    chainId: 16661,
    agentId: '1',
    epochId: 0,
    slot,
    strategyHash: H,
    inputHash,
    renter: ZERO_ADDRESS,
  });
  const { respData, commitOffset } = buildRespData({
    chatId: `chat-${slot}`,
    created: T0,
    model: 'glm-5.2',
    commitLine,
    decision: { dir: slot % 2 === 0 ? 'UP' : 'DOWN', conf: 0.7, size: 0.3 },
    promptTokens: 100,
    completionTokens: 50,
  });

  const reqSha = sha256Hex(`request-bytes-for-slot-${slot}`);
  const respSha = sha256Hex(respData);
  const text = signedText(reqSha, respSha);
  const signature = signAsTee(text);

  return {
    name,
    slot,
    commitLine,
    exp: buildExpectedCommit({
      book: BOOK,
      chainId: 16661,
      agentId: '1',
      epochId: 0,
      slot,
      strategyHash: H,
      inputHash,
      renter: ZERO_ADDRESS,
    }),
    respData,
    commitOffset,
    reqSha,
    respSha,
    signedText: text,
    signature,
    receiptCommit: buildReceiptCommit({
      respData,
      signature,
      commitOffset,
      inputHash,
      renter: ZERO_ADDRESS,
      salt: SALT,
    }),
    inputHash,
    renter: ZERO_ADDRESS,
    salt: SALT,
    snapshotTime: slotSnapshotTime(SPEC, slot),
    commitDeadline: slotCommitDeadline(SPEC, slot),
    revealOpen: slotRevealOpen(SPEC, slot),
    honest: true,
    expectedReject: null,
  };
}

/** A receipt whose commit line carries a one-byte strategy tamper: the demo red tx. */
function tamperedSlot(): SlotVector {
  const base = honestSlot(0, 'tampered-strategy-byte');
  const { tampered } = tamperStrategyByte(base.commitLine);

  const { respData, commitOffset } = buildRespData({
    chatId: 'chat-0',
    created: T0,
    model: 'glm-5.2',
    commitLine: tampered,
    decision: { dir: 'UP', conf: 0.7, size: 0.3 },
    promptTokens: 100,
    completionTokens: 50,
  });

  const respSha = sha256Hex(respData);
  const text = signedText(base.reqSha, respSha);
  const signature = signAsTee(text);

  return {
    ...base,
    name: 'tampered-strategy-byte',
    commitLine: tampered,
    respData,
    commitOffset,
    respSha,
    signedText: text,
    signature,
    receiptCommit: buildReceiptCommit({
      respData,
      signature,
      commitOffset,
      inputHash: base.inputHash,
      renter: ZERO_ADDRESS,
      salt: SALT,
    }),
    // The contract rebuilds EXP from its own untampered H, so the memcmp fails.
    honest: false,
    expectedReject: 'BadCommit',
  };
}

/**
 * A genuine, correctly-signed receipt for slot 1, replayed into slot 0.
 *
 * The receipt payload stays slot 1's; only the target slot changes, so the
 * timings must be slot 0's. Getting that wrong is what the fixture-integrity
 * test caught, and it matters: the vector is meaningless unless the replay is
 * attempted inside slot 0's real window.
 */
function crossSlotReplay(): SlotVector {
  const other = honestSlot(1);
  const target = 0;
  return {
    ...other,
    name: 'cross-slot-replay',
    slot: target,
    snapshotTime: slotSnapshotTime(SPEC, target),
    commitDeadline: slotCommitDeadline(SPEC, target),
    revealOpen: slotRevealOpen(SPEC, target),
    honest: false,
    expectedReject: 'BadCommit',
  };
}

function main(): void {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
  mkdirSync(outDir, { recursive: true });

  const vectors: SlotVector[] = [
    honestSlot(0),
    honestSlot(1),
    honestSlot(5),
    tamperedSlot(),
    crossSlotReplay(),
  ];

  const bundle = {
    $schema: 'fief-reference-fixtures/v2',
    generatedFrom: 'packages/reference/src/fixtures/generate.ts',
    note: 'Deterministic. Contract tests must import these and never restate expected values.',
    chainId: 16661,
    book: BOOK,
    agentId: '1',
    epochId: 0,
    operator: '0x000000000000000000000000000000000000000e',
    provider: PROVIDER,
    teeSigner: TEE_SIGNER,
    spec: SPEC,
    // Explicit, because Foundry's JSON cheatcodes do not support the `[*]`
    // wildcard and the Solidity suite needs to iterate.
    vectorCount: vectors.length,
    vectors,
  };

  const path = join(outDir, 'slots.json');
  writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${path} (${vectors.length} vectors, teeSigner ${TEE_SIGNER})\n`);
}

main();
