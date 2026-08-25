/**
 * ERC-8004 renter reputation, gated on a serve proof (PRD v2 §12, §15).
 *
 * Fief keeps two reputation systems apart on purpose. The objective record
 * lives in `RecordBook` on mainnet and is mechanically recomputable by anyone:
 * completeness, hit rate, latency. Subjective renter feedback lives in 0G's
 * ERC-8004 `AgenticIDReputationRegistry`, where `giveFeedback` will not accept
 * anything without a `ServeProof`. That is the property worth having: a rating
 * from someone who can prove they were actually served.
 *
 * TESTNET ONLY, and that is not a temporary shortcut. The Agentic ID SDK states
 * in `constants.ts` that no mainnet deployment exists, so every surface showing
 * this data must say testnet (PRD v2 §8).
 *
 * A ServeProof is signed by the agent's `agentSeal`, a key held inside the TEE
 * sandbox that runs the agent. Fief issues one per served slot, binding it to
 * the renter through `submitter`, so only that renter can redeem it.
 */

import {
  buildServeProofMessageHash,
  buildServeProofSigningHash,
  signServeProof,
  verifyServeProofSignature,
} from '@0gfoundation/0g-agenticid-sdk';
import type {ServeProof} from '@0gfoundation/0g-agenticid-sdk';
import {reputationRegistryAbi} from '@0gfoundation/0g-agenticid-sdk';
import {createPublicClient, http, keccak256, toHex} from 'viem';
import type {Address, Hash} from 'viem';

import {ZG_TESTNET} from './config.js';

/**
 * Live 0G Galileo testnet deployment.
 *
 * Read from the production attestor's `GET /config` on 2026-08-25 rather than
 * copied from a doc, because the SDK deliberately does not bundle addresses: a
 * proxy upgrade or redeploy would silently stale a hardcoded constant.
 */
export const AGENTIC_ID_TESTNET = {
  chainId: 16602,
  attestorUrl: 'https://agenticid.0g.ai',
  agenticID: '0x34493302287308f565cf3409daadedf4c8895648' as Address,
  reputationRegistry: '0xede70197313d0b603612dfc9801162d1ada3d196' as Address,
  teeDataVerifier: '0x9d48fcce51b4b39fcb6e4bd0840f75a987cef980' as Address,
  tappRegistry: '0x2ce80374318b1d7fb3345724457a182e0ad165c9' as Address,
  sandboxServing: '0x3490b9053ac46f7bf71a1cebffcb2be2c1405b41' as Address,
  canonicalErc8004: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
} as const;

export interface AttestorConfig {
  chain_id: number;
  agentic_id_addr: string;
  reputation_registry_addr: string;
  tee_data_verifier_addr: string;
  sandbox_serving_addr: string;
  frameworks: Array<{name: string; image: string}>;
}

/** Fetch the attestor's live config, so a redeploy upstream is detected rather than assumed away. */
export async function fetchAttestorConfig(
  url = AGENTIC_ID_TESTNET.attestorUrl,
): Promise<AttestorConfig> {
  const res = await fetch(`${url}/config`, {signal: AbortSignal.timeout(20_000)});
  if (!res.ok) throw new Error(`attestor /config returned HTTP ${res.status}`);
  return (await res.json()) as AttestorConfig;
}

/**
 * Confirm the addresses this module pins still match what the attestor serves.
 *
 * Cheap, and it turns an upstream proxy redeploy into a loud failure instead of
 * feedback silently written against a dead registry.
 */
export async function assertAddressesCurrent(): Promise<{ok: boolean; drift: string[]}> {
  const cfg = await fetchAttestorConfig();
  const drift: string[] = [];
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (cfg.chain_id !== AGENTIC_ID_TESTNET.chainId) drift.push(`chainId ${cfg.chain_id}`);
  if (!eq(cfg.agentic_id_addr, AGENTIC_ID_TESTNET.agenticID)) {
    drift.push(`agenticID ${cfg.agentic_id_addr}`);
  }
  if (!eq(cfg.reputation_registry_addr, AGENTIC_ID_TESTNET.reputationRegistry)) {
    drift.push(`reputationRegistry ${cfg.reputation_registry_addr}`);
  }
  if (!eq(cfg.tee_data_verifier_addr, AGENTIC_ID_TESTNET.teeDataVerifier)) {
    drift.push(`teeDataVerifier ${cfg.tee_data_verifier_addr}`);
  }
  return {ok: drift.length === 0, drift};
}

/* ------------------------------------------------------------------ */

export interface SlotServeParams {
  /** The Agentic ID token id, which is NOT the Fief agent id. */
  agentId: bigint;
  /** The renter, and the only address allowed to redeem this proof. */
  renter: Address;
  /** Fief's mainnet RecordBook slot this proof attests to. */
  fiefAgentId: bigint;
  epochId: bigint;
  slot: number;
  /** sha256 of the market snapshot, already on-chain in the Fief entry. */
  inputHash: Hash;
  /** keccak256 of the sealed strategy container. */
  strategyHash: Hash;
  servedAt: number;
  /** Seconds the renter has to redeem before the proof expires. */
  ttlSeconds?: number;
}

/**
 * Bind a Fief slot into an ERC-8004 serve proof.
 *
 * `taskHash` commits to the exact slot the renter was served, so a proof cannot
 * be reused for a different decision, and `dataHashes` carries the strategy
 * commitment and the input. Reputation earned this way is therefore tied to the
 * strategy version that produced it, which is the gap the SDK's own guide notes
 * is designed but not yet implemented: epoch 5 must not inherit epoch 2's score.
 */
export function buildSlotServeProof(p: SlotServeParams): {
  params: Parameters<typeof buildServeProofMessageHash>[0];
  taskHash: Hash;
} {
  const taskHash = keccak256(
    toHex(`FIEFv1|slot|${p.fiefAgentId}|${p.epochId}|${p.slot}|${p.renter.toLowerCase()}`),
  );

  return {
    taskHash,
    params: {
      chainId: BigInt(AGENTIC_ID_TESTNET.chainId),
      verifyingContract: AGENTIC_ID_TESTNET.agenticID,
      submitter: p.renter,
      agentId: p.agentId,
      timestamp: BigInt(p.servedAt),
      deadline: BigInt(p.servedAt + (p.ttlSeconds ?? 7 * 24 * 60 * 60)),
      taskHash,
      dataHashes: [p.strategyHash, p.inputHash],
      frameworkHash: keccak256(toHex('fief-runtime/1')),
    },
  };
}

/**
 * Sign a serve proof with the agent seal.
 *
 * The digest handed to `sign` is already the final EIP-191 hash, so the
 * callback must sign it raw. Using `signMessage({message:{raw}})` wraps EIP-191
 * a second time and the proof fails verification, which the SDK documents and
 * is easy to get wrong.
 */
export async function issueServeProof(
  p: SlotServeParams,
  sign: (digest: Hash) => Promise<`0x${string}`>,
): Promise<ServeProof> {
  const {params} = buildSlotServeProof(p);
  return signServeProof(params, sign);
}

export async function verifyIssuedProof(proof: ServeProof, agentSeal: Address): Promise<boolean> {
  return verifyServeProofSignature(proof, agentSeal, {
    chainId: BigInt(AGENTIC_ID_TESTNET.chainId),
    verifyingContract: AGENTIC_ID_TESTNET.agenticID,
  });
}

export function serveProofDigest(p: SlotServeParams): Hash {
  return buildServeProofSigningHash(buildSlotServeProof(p).params);
}

/* ------------------------------------------------------------------ */

/**
 * Read an agent's aggregate feedback from the live testnet registry.
 *
 * Uses the SDK's exported ABI rather than a hand-written one. A guessed ABI
 * already cost us once on this project: a hand-rolled `getAccount` shape
 * misdecoded a Compute sub-account balance by two orders of magnitude and sent
 * the diagnosis in the wrong direction. `summaryValue` here is `int128`, not
 * the unsigned type the obvious guess would use, because feedback can be
 * negative.
 */
export async function readSummary(agentId: bigint) {
  const client = createPublicClient({transport: http(ZG_TESTNET.rpc)});
  const [count, summaryValue, decimals] = (await client.readContract({
    address: AGENTIC_ID_TESTNET.reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: 'getSummary',
    args: [agentId, [], '', ''],
  })) as readonly [bigint, bigint, number];

  return {count, summaryValue, decimals};
}

/**
 * Is the registry actually deployed and answering at the pinned address?
 *
 * Deliberately separate from `readSummary`: a revert for an agent that was
 * never minted is CORRECT behaviour, not a broken integration, so conflating
 * the two would report a healthy registry as a failure.
 */
export async function registryReachable(): Promise<{deployed: boolean; codeSize: number}> {
  const client = createPublicClient({transport: http(ZG_TESTNET.rpc)});
  const code = await client.getCode({address: AGENTIC_ID_TESTNET.reputationRegistry});
  const size = code === undefined ? 0 : (code.length - 2) / 2;
  return {deployed: size > 0, codeSize: size};
}
