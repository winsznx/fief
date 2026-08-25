import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';

import {
  ZERO_ADDRESS,
  buildCommitLine,
  buildRespData,
} from './commit.js';
import {
  buildReceiptCommit,
  eip191Digest,
  recoverSigner,
  sha256Hex,
  signedText,
} from './receipt.js';
import { openEpoch, resolveSlot, slotCommitDeadline, slotRevealOpen } from './epoch.js';
import { applyCommit, applyReveal, type BookContext } from './recordbook.js';
import type { Address, EpochSpec, Hex } from './types.js';
import { RejectError } from './types.js';

const T0 = 1_800_000_000;
const BOOK = '0x00000000000000000000000000000000000000b0' as Address;
const OPERATOR = '0x000000000000000000000000000000000000000e' as Address;
const PROVIDER = '0x7dcfe6aea70350c2090041524c9b4a9262dce87d' as Address;
const H = `0x${'ab'.repeat(32)}` as Hex;
const SALT = `0x${'11'.repeat(32)}` as Hex;

/* A deterministic TEE signer, standing in for the provider's enclave key. */
const TEE_PRIV = new Uint8Array(32).fill(7);
const TEE_PUB = secp256k1.getPublicKey(TEE_PRIV, false).subarray(1);
const TEE_SIGNER = `0x${Buffer.from(keccak_256(TEE_PUB)).subarray(12).toString('hex')}` as Address;

function signAsTee(message: string): Hex {
  const digest = Buffer.from(eip191Digest(message).slice(2), 'hex');
  const sig = secp256k1.sign(digest, TEE_PRIV, { prehash: false });
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  const v = (sig.recovery + 27).toString(16).padStart(2, '0');
  return `0x${r}${s}${v}` as Hex;
}

const spec = (over: Partial<EpochSpec> = {}): EpochSpec => ({
  market: 'BTC-USDT',
  cadenceSeconds: 300,
  horizonSeconds: 300,
  maxCommitDelay: 30,
  disclosureDelay: 60,
  startTime: T0,
  slotCount: 12,
  strategyHash: H,
  providerSet: [PROVIDER],
  ...over,
});

const ctx: BookContext = {
  book: BOOK,
  chainId: 16661,
  agentId: '1',
  epochId: 0,
  operator: OPERATOR,
  teeSignerOf: (p) =>
    p.toLowerCase() === PROVIDER.toLowerCase()
      ? { signer: TEE_SIGNER, acknowledged: true }
      : null,
};

/** Produce a fully-formed, honest slot: receipt, commitment and reveal payload. */
function makeSlot(slot: number, inputHash: Hex) {
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
    decision: { dir: 'UP', conf: 0.7, size: 0.3 },
    promptTokens: 100,
    completionTokens: 50,
  });

  const reqSha = sha256Hex(`request-bytes-for-slot-${slot}`);
  const respSha = sha256Hex(respData);
  const signature = signAsTee(signedText(reqSha, respSha));
  const receiptCommit = buildReceiptCommit({
    respData,
    signature,
    commitOffset,
    inputHash,
    renter: ZERO_ADDRESS,
    salt: SALT,
  });

  return { respData, commitOffset, reqSha, respSha, signature, receiptCommit, inputHash };
}

describe('receipt primitives', () => {
  it('signs and recovers a 129-byte text', () => {
    const text = signedText(sha256Hex('a'), sha256Hex('b'));
    expect(text).toHaveLength(129);
    expect(recoverSigner(text, signAsTee(text)).toLowerCase()).toBe(TEE_SIGNER.toLowerCase());
  });

  it('accepts v as both 27/28 and 0/1', () => {
    const text = signedText(sha256Hex('a'), sha256Hex('b'));
    const sig = signAsTee(text);
    const low = (sig.slice(0, -2) +
      (parseInt(sig.slice(-2), 16) - 27).toString(16).padStart(2, '0')) as Hex;
    expect(recoverSigner(text, low).toLowerCase()).toBe(TEE_SIGNER.toLowerCase());
  });
});

describe('commitDecision (I12: no late commits)', () => {
  it('accepts a commit from the operator inside the deadline', () => {
    const st = openEpoch(spec(), T0 - 1);
    const s = makeSlot(0, sha256Hex('snap-0'));
    expect(() =>
      applyCommit(st, ctx, { ...s, slot: 0, provider: PROVIDER, sender: OPERATOR, now: T0 + 10 }),
    ).not.toThrow();
    expect(resolveSlot(st, 0, T0 + 10)).toBe('committed');
  });

  it('accepts exactly at the deadline and rejects one second later', () => {
    const deadline = slotCommitDeadline(spec(), 0);

    const ok = openEpoch(spec(), T0 - 1);
    const a = makeSlot(0, sha256Hex('snap-0'));
    expect(() =>
      applyCommit(ok, ctx, { ...a, slot: 0, provider: PROVIDER, sender: OPERATOR, now: deadline }),
    ).not.toThrow();

    const late = openEpoch(spec(), T0 - 1);
    expect(() =>
      applyCommit(late, ctx, {
        ...a,
        slot: 0,
        provider: PROVIDER,
        sender: OPERATOR,
        now: deadline + 1,
      }),
    ).toThrow(new RejectError('SlotDeadlinePassed'));
  });

  it('rejects a non-operator, a duplicate slot and an unpinned provider', () => {
    const st = openEpoch(spec(), T0 - 1);
    const s = makeSlot(0, sha256Hex('snap-0'));
    const base = { ...s, slot: 0, provider: PROVIDER, sender: OPERATOR, now: T0 + 5 };

    expect(() => applyCommit(st, ctx, { ...base, sender: BOOK })).toThrow(
      new RejectError('NotOperator'),
    );
    expect(() => applyCommit(st, ctx, { ...base, provider: BOOK })).toThrow(
      new RejectError('ProviderNotPinned'),
    );

    applyCommit(st, ctx, base);
    expect(() => applyCommit(st, ctx, base)).toThrow(new RejectError('SlotAlreadyCommitted'));
  });
});

describe('revealDecision', () => {
  const openAndCommit = (slot = 0) => {
    const st = openEpoch(spec(), T0 - 1);
    const s = makeSlot(slot, sha256Hex(`snap-${slot}`));
    applyCommit(st, ctx, { ...s, slot, provider: PROVIDER, sender: OPERATOR, now: T0 + 5 });
    return { st, s };
  };

  it('reveals an honest slot after the disclosure window', () => {
    const { st, s } = openAndCommit();
    const at = slotRevealOpen(st.spec, 0);
    const entry = applyReveal(st, ctx, {
      slot: 0,
      respData: s.respData,
      signature: s.signature,
      commitOffset: s.commitOffset,
      inputHash: s.inputHash,
      renter: ZERO_ADDRESS,
      salt: SALT,
      now: at,
    });

    expect(entry.teeSigner.toLowerCase()).toBe(TEE_SIGNER.toLowerCase());
    expect(resolveSlot(st, 0, at)).toBe('revealed');
  });

  it('refuses to reveal before the window opens', () => {
    const { st, s } = openAndCommit();
    expect(() =>
      applyReveal(st, ctx, {
        slot: 0,
        respData: s.respData,
        signature: s.signature,
        commitOffset: s.commitOffset,
        inputHash: s.inputHash,
        renter: ZERO_ADDRESS,
        salt: SALT,
        now: slotRevealOpen(st.spec, 0) - 1,
      }),
    ).toThrow(new RejectError('RevealTooEarly'));
  });

  it('rejects a reveal that does not open the published commitment (I14)', () => {
    const { st, s } = openAndCommit();
    const at = slotRevealOpen(st.spec, 0);

    // Same bytes, different salt: the commitment cannot be opened.
    expect(() =>
      applyReveal(st, ctx, {
        slot: 0,
        respData: s.respData,
        signature: s.signature,
        commitOffset: s.commitOffset,
        inputHash: s.inputHash,
        renter: ZERO_ADDRESS,
        salt: `0x${'22'.repeat(32)}` as Hex,
        now: at,
      }),
    ).toThrow(new RejectError('BadReveal'));

    // The slot is NOT burned: reveal is permissionless, so burning on failure
    // would let anyone destroy an honest agent's completeness with garbage
    // reveals. It stays committed and the correct payload still opens it.
    expect(resolveSlot(st, 0, at)).toBe('committed');

    applyReveal(st, ctx, {
      slot: 0,
      respData: s.respData,
      signature: s.signature,
      commitOffset: s.commitOffset,
      inputHash: s.inputHash,
      renter: ZERO_ADDRESS,
      salt: SALT,
      now: at,
    });
    expect(resolveSlot(st, 0, at)).toBe('revealed');
  });

  it('rejects tampered response bytes', () => {
    const { st, s } = openAndCommit();
    const at = slotRevealOpen(st.spec, 0);
    // The decision JSON lives inside the envelope's content string, so its
    // quotes are escaped: the raw bytes read \"conf\":0.7, not "conf":0.7.
    const tampered = s.respData.replace('\\"conf\\":0.7', '\\"conf\\":0.9');
    expect(tampered).not.toBe(s.respData);

    expect(() =>
      applyReveal(st, ctx, {
        slot: 0,
        respData: tampered,
        signature: s.signature,
        commitOffset: s.commitOffset,
        inputHash: s.inputHash,
        renter: ZERO_ADDRESS,
        salt: SALT,
        now: at,
      }),
    ).toThrow(new RejectError('BadReveal'));
  });

  it('rejects a receipt signed by the wrong key', () => {
    const st = openEpoch(spec(), T0 - 1);
    const s = makeSlot(0, sha256Hex('snap-0'));

    const rogue = new Uint8Array(32).fill(9);
    const digest = Buffer.from(eip191Digest(signedText(s.reqSha, s.respSha)).slice(2), 'hex');
    const rs = secp256k1.sign(digest, rogue, { prehash: false });
    const rogueSig = `0x${rs.r.toString(16).padStart(64, '0')}${rs.s
      .toString(16)
      .padStart(64, '0')}${(rs.recovery + 27).toString(16).padStart(2, '0')}` as Hex;

    const receiptCommit = buildReceiptCommit({
      respData: s.respData,
      signature: rogueSig,
      commitOffset: s.commitOffset,
      inputHash: s.inputHash,
      renter: ZERO_ADDRESS,
      salt: SALT,
    });

    applyCommit(st, ctx, {
      slot: 0,
      reqSha: s.reqSha,
      respSha: s.respSha,
      receiptCommit,
      provider: PROVIDER,
      sender: OPERATOR,
      now: T0 + 5,
    });

    expect(() =>
      applyReveal(st, ctx, {
        slot: 0,
        respData: s.respData,
        signature: rogueSig,
        commitOffset: s.commitOffset,
        inputHash: s.inputHash,
        renter: ZERO_ADDRESS,
        salt: SALT,
        now: slotRevealOpen(st.spec, 0),
      }),
    ).toThrow(new RejectError('BadSigner'));
  });

  it('rejects a commit line naming a different slot', () => {
    // A genuine, TEE-signed receipt for slot 1 replayed into slot 0.
    const st = openEpoch(spec(), T0 - 1);
    const other = makeSlot(1, sha256Hex('snap-1'));

    applyCommit(st, ctx, {
      slot: 0,
      reqSha: other.reqSha,
      respSha: other.respSha,
      receiptCommit: other.receiptCommit,
      provider: PROVIDER,
      sender: OPERATOR,
      now: T0 + 5,
    });

    expect(() =>
      applyReveal(st, ctx, {
        slot: 0,
        respData: other.respData,
        signature: other.signature,
        commitOffset: other.commitOffset,
        inputHash: other.inputHash,
        renter: ZERO_ADDRESS,
        salt: SALT,
        now: slotRevealOpen(st.spec, 0),
      }),
    ).toThrow(new RejectError('BadCommit'));
  });

  it('cannot reveal a slot twice', () => {
    const { st, s } = openAndCommit();
    const at = slotRevealOpen(st.spec, 0);
    const payload = {
      slot: 0,
      respData: s.respData,
      signature: s.signature,
      commitOffset: s.commitOffset,
      inputHash: s.inputHash,
      renter: ZERO_ADDRESS,
      salt: SALT,
      now: at,
    };
    applyReveal(st, ctx, payload);
    expect(() => applyReveal(st, ctx, payload)).toThrow(new RejectError('AlreadyRevealed'));
  });

  it('cannot reveal a slot that was never committed', () => {
    const st = openEpoch(spec(), T0 - 1);
    const s = makeSlot(0, sha256Hex('snap-0'));
    expect(() =>
      applyReveal(st, ctx, {
        slot: 0,
        respData: s.respData,
        signature: s.signature,
        commitOffset: s.commitOffset,
        inputHash: s.inputHash,
        renter: ZERO_ADDRESS,
        salt: SALT,
        now: slotRevealOpen(st.spec, 0),
      }),
    ).toThrow(new RejectError('NoCommit'));
  });
});
