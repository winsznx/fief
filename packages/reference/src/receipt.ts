/**
 * Receipt verification and the commit/reveal binding (PRD v2 §4.3, §5).
 *
 * Zero chain dependencies: `@noble/hashes` and `@noble/curves` are primitive
 * crypto, not an SDK. Deliberately no ethers/viem here, so the reference model
 * can never accidentally inherit behaviour from a client library. That
 * independence is the point: 0G's own `processResponse` trusts the
 * provider-returned `text` and only ecrecovers it, while Fief recomputes both
 * hashes and rebuilds the signed text before recovery (PRD v2 §4.4).
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';

import type { Address, Hex } from './types.js';

const hex = (b: Uint8Array): Hex => `0x${Buffer.from(b).toString('hex')}`;

const fromHex = (h: string): Uint8Array => {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  if (s.length % 2 !== 0) throw new Error(`fromHex: odd-length input ${h}`);
  return Uint8Array.from(Buffer.from(s, 'hex'));
};

export const sha256Hex = (data: string | Uint8Array): Hex =>
  hex(nobleSha256(typeof data === 'string' ? Buffer.from(data, 'utf8') : data));

export const keccak256Hex = (data: string | Uint8Array): Hex =>
  hex(keccak_256(typeof data === 'string' ? Buffer.from(data, 'utf8') : data));

/**
 * The exact 129-byte ASCII text the 0G TeeML provider signs.
 *
 * `sha256hex(reqBody) + ":" + sha256hex(respData)`, lowercase hex. Confirmed
 * byte-exact against a live mainnet provider on 2026-08-25 (PRD v2 §0.6.1).
 */
export function signedText(reqSha: Hex, respSha: Hex): string {
  const a = reqSha.toLowerCase().replace(/^0x/, '');
  const b = respSha.toLowerCase().replace(/^0x/, '');
  if (a.length !== 64 || b.length !== 64) {
    throw new Error('signedText: both hashes must be 32 bytes');
  }
  const text = `${a}:${b}`;
  // The on-chain EIP-191 prefix hard-codes this length, so a drift here would
  // be a silent verification failure rather than a loud one.
  if (text.length !== 129) throw new Error(`signedText: expected 129 bytes, got ${text.length}`);
  return text;
}

/** EIP-191 personal-message digest, with the length the contract hard-codes. */
export function eip191Digest(message: string): Hex {
  const payload = Buffer.from(`\x19Ethereum Signed Message:\n${message.length}${message}`, 'utf8');
  return keccak256Hex(payload);
}

/**
 * Recover the signer of an EIP-191 personal-message signature.
 *
 * Accepts v as 27/28 or 0/1: the 0G signer normalises to 27/28, but tolerating
 * both costs nothing and avoids a whole class of integration bug.
 */
export function recoverSigner(message: string, signature: Hex): Address {
  const sig = fromHex(signature);
  if (sig.length !== 65) throw new Error(`recoverSigner: expected 65-byte signature, got ${sig.length}`);

  const vRaw = sig[64] as number;
  const recovery = vRaw >= 27 ? vRaw - 27 : vRaw;
  if (recovery !== 0 && recovery !== 1) throw new Error(`recoverSigner: bad recovery id ${vRaw}`);

  const digest = fromHex(eip191Digest(message));
  const point = secp256k1.Signature.fromCompact(sig.subarray(0, 64))
    .addRecoveryBit(recovery)
    .recoverPublicKey(digest);

  // Ethereum address = last 20 bytes of keccak256 of the uncompressed pubkey
  // without its 0x04 prefix.
  const pub = point.toRawBytes(false).subarray(1);
  return `0x${Buffer.from(keccak_256(pub)).subarray(12).toString('hex')}` as Address;
}

export interface ReceiptCheck {
  ok: boolean;
  respShaMatches: boolean;
  textMatches: boolean;
  signerMatches: boolean;
  recovered: Address | null;
  reason: string | null;
}

/**
 * The full receipt check, mirroring what the contract does at reveal.
 *
 * `providerText` is what the provider's signature endpoint returned. Comparing
 * our recomputed text against it is the check 0G's own SDK does not do, and it
 * is the one that catches a provider returning a signature over bytes that are
 * not the bytes it actually served.
 */
export function verifyReceipt(args: {
  reqSha: Hex;
  respData: string;
  signature: Hex;
  expectedSigner: Address;
  providerText?: string;
}): ReceiptCheck {
  const respSha = sha256Hex(args.respData);
  const text = signedText(args.reqSha, respSha);

  const textMatches = args.providerText === undefined ? true : args.providerText === text;
  const respShaMatches =
    args.providerText === undefined ? true : args.providerText.slice(65) === respSha.slice(2);

  let recovered: Address | null = null;
  try {
    recovered = recoverSigner(text, args.signature);
  } catch {
    recovered = null;
  }

  const signerMatches =
    recovered !== null && recovered.toLowerCase() === args.expectedSigner.toLowerCase();

  const reason = !textMatches
    ? 'provider text does not match recomputed sha256(req):sha256(resp)'
    : recovered === null
      ? 'signature could not be recovered'
      : !signerMatches
        ? 'recovered signer is not the registered TEE signer'
        : null;

  return {
    ok: textMatches && respShaMatches && signerMatches,
    respShaMatches,
    textMatches,
    signerMatches,
    recovered,
    reason,
  };
}

/* ------------------------------------------------------------------ *
 * ABI encoding for the reveal binding
 * ------------------------------------------------------------------ */

const WORD = 32;
const padLeft = (b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(WORD);
  out.set(b, WORD - b.length);
  return out;
};
const padRight = (b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(Math.ceil(b.length / WORD) * WORD);
  out.set(b, 0);
  return out;
};
const uintWord = (n: number | bigint): Uint8Array => {
  let s = BigInt(n).toString(16);
  if (s.length % 2 !== 0) s = `0${s}`;
  return padLeft(fromHex(s));
};

/**
 * `abi.encode(bytes respData, bytes sig, uint32 commitOffset, bytes32 inputHash,
 *             address renter, bytes32 salt)`
 *
 * Written out explicitly rather than pulled from a library so the reference and
 * the Solidity agree by construction. Two dynamic types, so the head carries
 * their offsets and the tail carries length-prefixed, right-padded data.
 */
export function encodeRevealTuple(args: {
  respData: string;
  signature: Hex;
  commitOffset: number;
  inputHash: Hex;
  renter: Address;
  salt: Hex;
}): Uint8Array {
  const respBytes = Buffer.from(args.respData, 'utf8');
  const sigBytes = fromHex(args.signature);

  const HEAD = 6 * WORD;
  const respTailLen = WORD + Math.ceil(respBytes.length / WORD) * WORD;
  const offsetResp = HEAD;
  const offsetSig = HEAD + respTailLen;

  const parts: Uint8Array[] = [
    uintWord(offsetResp),
    uintWord(offsetSig),
    uintWord(args.commitOffset),
    padLeft(fromHex(args.inputHash)),
    padLeft(fromHex(args.renter)),
    padLeft(fromHex(args.salt)),
    uintWord(respBytes.length),
    padRight(Uint8Array.from(respBytes)),
    uintWord(sigBytes.length),
    padRight(sigBytes),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * The commitment published at commit time, opened at reveal time.
 *
 * The salt is what keeps the direction private: without it, a watcher could
 * brute-force the three possible directions against the commitment and read
 * the signal for free, which would defeat the entire §4.2 economics.
 */
export function buildReceiptCommit(args: {
  respData: string;
  signature: Hex;
  commitOffset: number;
  inputHash: Hex;
  renter: Address;
  salt: Hex;
}): Hex {
  return keccak256Hex(encodeRevealTuple(args));
}
