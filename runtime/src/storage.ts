/**
 * Sealed strategy storage on 0G Storage (PRD v2 §12).
 *
 * The strategy container is encrypted app-side with AES-256-GCM before it
 * leaves the process, and only the ciphertext is uploaded. The SDK ships an
 * `EncryptedFile` helper, but Fief encrypts itself so key custody is explicit
 * and the key never reaches a library we do not control.
 *
 * Two values come out of this and they do different jobs:
 *   - `H` = keccak256 of the canonical plaintext, the strategy commitment that
 *     appears in every commit line.
 *   - `storageRoot` = the 0G Storage merkle root of the ciphertext, which is
 *     what makes the sealed blob retrievable and auditable later.
 *
 * The root hash is computed locally from the same bytes, so it is known even if
 * the upload has to be retried, and a later download can be checked against it.
 */

import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

import {ethers} from 'ethers';
import {Indexer, MemData} from '@0gfoundation/0g-storage-ts-sdk';

import {ZG_MAINNET, ZG_TESTNET} from './config.js';

/** Turbo indexers. The SDK bundles only the testnet one. */
export const INDEXER = {
  mainnet: process.env.ZG_INDEXER ?? 'https://indexer-storage-turbo.0g.ai',
  testnet: process.env.ZG_INDEXER ?? 'https://indexer-storage-testnet-turbo.0g.ai',
} as const;

export interface SealedBlob {
  /** AES-256-GCM: iv || authTag || ciphertext. */
  bytes: Uint8Array;
  keyHex: string;
}

/**
 * Encrypt the canonical strategy JSON.
 *
 * The key is returned rather than persisted. In production it is sealed to the
 * owner's pubkey (ECIES) and only ever re-sealed to an auditor under an
 * explicit, logged grant (invariant I7).
 */
export function seal(plaintext: string, keyHex?: string): SealedBlob {
  const key = keyHex === undefined ? randomBytes(32) : Buffer.from(keyHex.replace(/^0x/, ''), 'hex');
  if (key.length !== 32) throw new Error('seal: key must be 32 bytes');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {bytes: Buffer.concat([iv, tag, ct]), keyHex: `0x${key.toString('hex')}`};
}

export function unseal(blob: Uint8Array, keyHex: string): string {
  const buf = Buffer.from(blob);
  const key = Buffer.from(keyHex.replace(/^0x/, ''), 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

/** Merkle root of the blob, computed locally. This is what goes on-chain. */
export async function rootHashOf(bytes: Uint8Array): Promise<string> {
  const file = new MemData(bytes);
  const [tree, err] = await file.merkleTree();
  if (err !== null || tree === null) throw new Error(`merkleTree failed: ${String(err)}`);
  const root = tree.rootHash();
  if (root === null) throw new Error('merkleTree returned a null root');
  return root;
}

export interface UploadResult {
  rootHash: string;
  txHash: string | null;
  uploaded: boolean;
  note: string | null;
}

/**
 * Upload the sealed blob to 0G Storage.
 *
 * The local root hash is returned either way. An upload failure is reported
 * rather than thrown, because the commitment on-chain is the root hash and the
 * agent can be registered with it while the blob is re-uploaded; what must
 * never happen is registering a root that does not match the bytes.
 */
export async function upload(
  bytes: Uint8Array,
  privateKey: string,
  network: 'mainnet' | 'testnet',
): Promise<UploadResult> {
  const rootHash = await rootHashOf(bytes);
  const rpc = network === 'mainnet' ? ZG_MAINNET.rpc : ZG_TESTNET.rpc;

  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(INDEXER[network]);

    const [res, err] = await indexer.upload(new MemData(bytes), rpc, signer);
    if (err !== null) return {rootHash, txHash: null, uploaded: false, note: String(err)};

    const first = Array.isArray(res) ? res[0] : res;
    const returned = (first as {rootHash?: string; txHash?: string} | undefined) ?? {};
    if (returned.rootHash !== undefined && returned.rootHash !== rootHash) {
      // A mismatch means the SDK hashed different bytes than we did, which
      // would silently break every later audit of this blob.
      throw new Error(`root mismatch: local ${rootHash} vs indexer ${returned.rootHash}`);
    }
    return {rootHash, txHash: returned.txHash ?? null, uploaded: true, note: null};
  } catch (e) {
    return {
      rootHash,
      txHash: null,
      uploaded: false,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}
